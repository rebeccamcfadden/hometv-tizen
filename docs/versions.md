# Versions on Samsung (draft for Rebecca to sort)

**Draft, 2026-11-04.** Rebecca (22:36): "break all the features into v0 (first install test features), v1, v2, etc.
i want to get the gist of the layout and design in first and then ship updates to those launchers if my dad likes
the look/feel". Each line is one feature: **what it is · cost · depends on · where it stands**. Move lines between
lists freely; nothing here is decided.

Cost: **S** half a day or less, **M** one or two days, **L** more. "TV call" means it can only be checked on the
family's TV (at most once a week). "Keys" means it needs the household's API keys on the TV (TMDB, Watchmode or
Movie of the Night). Samsung has no root to worry about (that's LG's question).

## v0: the first install, to judge the look and feel

- Install HomeTV as its own app with AeroTizen's PC tool · S · a TV call: Developer Mode, the laptop, a Samsung
  account sign-in for the TV's certificate (18:40 chose TizenBrew for the first call, so this is the first or the
  second call) · tool works on this PC
- Home: top bar (greeting, date, clock), nav (Home, Movies, TV Shows, Search), app row · S · - · built
- App row: the TV's own app art, opens each app · S · - · built (emulator)
- All apps: the TV's apps; hold OK to add or remove from Home · M · - · built (W4), merging
- Movies and TV Shows: list chips, poster grid, Sort, Filters · M · - · built (W4), merging
- Title page: details, Watch, Where to watch with prices, Episodes, Cast & crew, More like this, rent/buy dialog ·
  M · - · built (W3), merging
- Search: on-screen keyboard, recents, results with chips · M · - · built (W3), merging
- Person page · S · - · built (W4), merging
- Sample catalogue: real titles and posters (posters need internet), mock prices, one region (which one: Rebecca;
  the sample uses design_preview's first-run default) · S · - · built
- Midnight look (the design's colours and type) · S · - · in, from the shared package
- Watch opens the app on its home (not the title yet) · S · - · built
- Back to HomeTV after the remote's Home key (AeroTizen's helper) · S · a TV call (the emulator can't show it) ·
  comes with AeroTizen
- Weather in the top bar (Open-Meteo, no key) · S-M · internet · not built
- The nav's Wi-Fi, Inputs and Settings buttons and their dropdowns (layout only) · M · - · not built

## v1: real data and everyday use

- Live catalogue from TMDB (port the Android launcher's client) · L · keys (TMDB) · not built
- The key page: a QR on the TV, keys typed on a phone · S · a TV call (background services are blank on the
  emulator) · built (W1)
- Live prices and where to watch (Watchmode / Movie of the Night) · M · keys · not built
- Works offline: last catalogue kept on the TV · M · - · not built
- Watch opens the title itself (Netflix, Prime Video, YouTube) · M · the second TV call's checks · YouTube's link
  known, others untested
- Updates without the laptop (signed pages) · S to turn on · somewhere to host them, a TV call · built (W2), off
- Opens at power-on · M · research after the first call, a TV call · not started
- Home key goes straight to HomeTV · M · research after the first call, a TV call · not started
- My list and Seen kept on the TV · S · - · built as a sample (W3/W4)
- Pick for me · M · - · not ported
- First-run setup (services, region, keys) · M · - · not ported
- Launcher settings: services, Home row apps, weather place, About · L · - · not ported
- Inputs: HDMI ports with the device's name (AeroTizen's) · M · a TV call · comes with AeroTizen
- Title menu (hold OK on a title: My list, Seen, open in) · S · - · not ported

## v2: more of the design

- Themes: Classic set, Seasonal, daylight cycle · L · - · not ported
- Weather effects over the background (snow, rain) · M · speed check on a weak TV · not ported
- Screensaver · M · - · not ported
- Continue watching row (Tizen-only, Rebecca 18:38) · M-L · a small Figma redesign; works on 2024 models, not every
  app fills it · not started
- Notes from a phone (TV-side page) · M · a TV call (background service) · not ported
- TMDB account: sign-in, Household and Friends lists · L · keys, the account flow · not ported
- Update notice on About · S · updates turned on · not ported
- Privacy checklist screen · M · - · researched (docs/privacy.md)
- A report the family can send on request (no analytics) · M · - · not started
- AeroTizen extras, each optional: card size per row, clock and date formats, hide the weather place, a "back to
  Samsung's home" row, Fireplace tile, animated backgrounds · S-M each · - · come with AeroTizen

## Later or maybe

- The phone as a remote · M · back burner (Rebecca 19:36)
- Native Home (Samsung's Home replaced, experimental) · S · only if the family's model is confirmed working
- A public release and a row in upstream's SHOWCASE.md · S · once it works (18:35)
- HbbTV apps, Art Mode (The Frame) · - · comes with AeroTizen; little use for a US family without a Frame

## Not on Samsung (decided)

- Several regions at once (Rebecca 19:30: one region)
