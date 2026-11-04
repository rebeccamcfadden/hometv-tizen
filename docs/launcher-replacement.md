# Replacing Samsung's home screen: what's possible

Research, 2026-11-04, without the TV. Nothing here has been run on any TV. Sources at the end; how sure
each point is, is said where it matters.

## The short version

- **Samsung's Home button can't be taken by an app.** On a normal (not rooted) Samsung, every app that claims to be
  a home screen does one of two things: it **comes back a second or two after Home**, or it uses an **experimental
  setting change** (AeroTizen's "Native Home") that has worked on a handful of 2022-2025 TVs.
- **Two open-source home screens already do the most that's possible without root:** **AeroTizen** (MIT licence,
  20 models tested, a Windows tool that does the certificate and install) and **Skylight**. HomeTV can do the same
  things, and can borrow how they do them.
- **For the test TV: the "comes back after Home" kind, plus Samsung's own settings.** It's all undoable, needs
  nothing beyond Developer Mode and one install from the laptop, and is what both projects use by default.
- **Samsung's own home bar can't be changed** by any app: its ad rows stay, but its settings can turn some of them
  off ([privacy.md](privacy.md)) and a home screen can cover it.

## Three levels

| | A. Settings only | B. Its own app (Developer Mode) | C. Root |
|---|---|---|---|
| **What's installed** | Nothing | One app, signed for that TV, installed once from a laptop | B, plus a helper that roots the TV at each full restart |
| **Opens at power-on** | Only "Autorun Last App" (reopens whatever was open last) | Waking from standby: yes (Autorun Last App, or a background helper). Full restart: not by itself; AeroTizen's Native Home or a SmartThings rule (Skylight) does it, ~30-90 s late | Yes |
| **Home button** | Samsung's | Comes back 1-2 s after Home (not inside YouTube, Prime Video, Spotify, Live TV: they don't say when they're on screen). Native Home (experimental): Home goes to it directly | Could be reassigned for good |
| **Samsung's ad rows** | Some off in settings; TV Plus can be disabled | Same, and the app covers the bar | Could be removed |
| **Undo** | Settings back | Delete the app; Native Home has a restore command | Remove the helper, restart; see [jailbreak.md](jailbreak.md) |
| **Risk** | None | Low | Higher: see [jailbreak.md](jailbreak.md) |

## How the existing ones do it

**AeroTizen** ([helalaou/AeroTizen](https://github.com/helalaou/AeroTizen), MIT, read at `093c2d5`, 2026-11-04).
A full home screen (apps, inputs with HDMI names, weather, Continue Watching) and a command-line tool for Windows,
Mac and Linux that makes the Samsung certificate, signs and installs the app, and later updates it. Two Home modes:

- **Watcher (default):** a background part of the app (`DclHome001.Watcher`, a Tizen service set to start at boot
  and restart itself) notices when Samsung's home bar is showing and opens AeroTizen again. Its own limits: it can't
  tell when YouTube, Prime Video, Spotify or Live TV are on screen, so Home from inside those stays on Samsung's bar
  until they close.
- **Native Home (opt-in, experimental):** changes the TV's own setting for which app Home opens (and optionally which
  opens at power-on), through the Developer Mode connection, no root. It saves the original values on the PC first
  and has a `home restore` command that works even after AeroTizen is deleted. Confirmed on a 2024 Frame and an
  S90C (Tizen 9); "works" or "fails" reported on a dozen other models in its table; 2020-2021 TVs don't work yet.
  Startup shows a black screen for about 30 seconds. Upstream cleanyourtv #2485 reported the same kind of setting
  change on a DU7000, method withheld.
- It also tells people to turn off Autorun Samsung TV Plus and Autorun Last App, which otherwise open first.

**Skylight** ([SaudSatopay/skylight-tizen](https://github.com/SaudSatopay/skylight-tizen)). Its helper asks the TV
once a second, through the TV's own local address (`127.0.0.1:8001/api/v2/applications/<id>`), whether an app is
on screen, and brings Skylight back when nothing of its own is. It re-opens itself without reloading (an
`eden_resume` app control, the same TizenBrew uses). Full restarts: two SmartThings cloud rules open it at wake and
after a cold boot (the TV sends no event for a cold boot, so one rule watches for the TV checking in), about 90
seconds late. The background helper doesn't start by itself after a full restart on these TVs (Skylight's README).

**Blocky Cabin** and **Clean TV Home** (upstream SHOWCASE): the first relies only on Autorun Last App; the second
reuses AeroTizen's watcher.

**TizenBrew** isn't a home screen. Its "Autolaunch" setting only picks what TizenBrew opens into.

## What HomeTV should do on Samsung

1. **Be its own app** (the same conclusion as [research.md › Working without the internet](research.md#working-without-the-internet)):
   a home screen has to have its own tile, its own background helper and the TV's functions in the page. Installed
   once with TizenBrew Installer or AeroTizen's tool (both make the per-TV certificate; AeroTizen's also updates).
2. **Comes back after Home**, AeroTizen's and Skylight's way (a background helper and the TV's local status address),
   off by default as the fork requires, switched on in HomeTV's settings.
3. **Samsung's start settings** set by the household from a short guide: Start with Smart Hub Home off, Autorun
   Samsung TV Plus off, Autorun Last App on (so a wake from standby returns to HomeTV).
4. **Native Home: not on the test TV for now.** It's experimental, unproven on most models, and changes a system
   setting. Revisit if AeroTizen's table grows to that TV's model.
5. **Build on AeroTizen** (decided 2026-11-04: yes, our screens on its base, its MIT licence kept and credited):
   MIT-licensed, maintained (commits today), with the install, certificate and update tool HomeTV would otherwise
   write. HomeTV's own part is the screen (catalogue, prices, Pick for me) from `design_preview/`.

## What it costs the household

- Developer Mode on, a laptop once (as for TizenBrew).
- 2023+ TVs: a Samsung account sign-in to make the certificate; when it expires, the laptop again. Its lifetime is
  still unknown (the first TV call writes down what the installer shows).
- A small background process while the TV is on. No figure for its memory yet.
- A Samsung software update may change the local status address the helper uses; then "comes back after Home" stops
  until HomeTV is updated, and everything else still works.

## Undo

- Settings: back to the values written down first.
- The app: Apps › Settings › HomeTV › Delete (or the install tool's uninstall).
- Native Home, if ever used: the tool's restore command first, then a 60-second power-off, then delete.
- Developer Mode off: Apps › `12345` › Off, full restart.

## Sources

- AeroTizen: [README](https://github.com/helalaou/AeroTizen) (Home options, Limits, Tested on, root), `launcher/config.xml`,
  [docs/settings.md](https://github.com/helalaou/AeroTizen/blob/main/docs/settings.md), read at `093c2d5`.
- Skylight: [README](https://github.com/SaudSatopay/skylight-tizen) (How it works, What does not work, Compatibility).
- Blocky Cabin: [README](https://github.com/CsPS0/blocky-tv-tizen); Clean TV Home: [README](https://github.com/thisizmsk-png/tv-home).
- Upstream cleanyourtv: [docs/devices/samsung-tizen.md](https://github.com/Gathin23/cleanyourtv/blob/main/docs/devices/samsung-tizen.md),
  [#2485](https://github.com/Gathin23/cleanyourtv/pull/2485), [SHOWCASE](https://github.com/Gathin23/cleanyourtv/blob/main/SHOWCASE.md).
- TizenBrew Installer: [source](https://github.com/reisxd/TizenBrewInstaller) (`fetchLatestRelease`, `resignOrInstall`).
