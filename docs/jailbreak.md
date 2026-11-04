# "Jailbreaking" a Samsung TV: the options, safest first

Research, 2026-11-04, for deciding, not doing. Nothing here has been run on any TV, and this note gives no exploit
steps. Anything that can't be undone needs a big warning and the project lead's explicit pick before it goes into a
guide.

## The short version

- **Recommended for the test TV: Developer Mode plus one app, nothing more.** That's Samsung's own switch for app
  makers; it's what TizenBrew, AeroTizen and HomeTV use; it's undone from the TV's menu; and US law explicitly
  allows it (the DMCA exemption for smart TVs, renewed in 2024, covers running lawfully obtained apps).
- **Real root exists now** for many 2021-2026 Samsungs (`samsung-tv-root`, and AeroTizen's optional helper built on
  it). It rests on a known, apparently unpatched Samsung bug plus, on some models, kernel or graphics-driver bugs.
  It isn't needed for anything HomeTV does, carries a real risk of a TV that won't start, and a Samsung update can
  silently end it. **Not for the test TV.**
- **Never:** the hidden service/factory menus.

## The options

| # | Option | What it gives | Needs | Risk of a TV that won't start | After a Samsung update | Undo | Warranty | For the test TV? |
|---|---|---|---|---|---|---|---|---|
| 1 | **Settings only** ([privacy.md](privacy.md)) | Tracking and autoplay off | The remote | None | Re-check the settings | Settings back | Unaffected | **Yes** |
| 2 | **Developer Mode + one app** (TizenBrew, AeroTizen, or HomeTV as its own app) | A home screen, apps opened from it, a helper that brings it back after Home | A laptop once; on 2023+ TVs a Samsung account sign-in for the certificate | Very low | Usually kept; may need reinstalling if Developer Mode is switched off or the certificate ends | Delete the app; Developer Mode off | Not voided by Samsung's terms; damage it caused wouldn't be covered | **Yes** |
| 3 | **AeroTizen "Native Home"** (no root) | Home goes to the new home screen directly; optionally it opens at power-on | 2 plus AeroTizen's tool on a PC; a backup it saves first | Low, but experimental (confirmed on two Tizen 9 TVs) | Not stated | Its restore command, then a 60-second power-off | Unofficial | **Not now**; maybe later if the test TV's model is confirmed |
| 4 | **Root, re-run each full restart** (`samsung-tv-root` from a PC, or AeroTizen's optional helper on the TV) | Full control: could remove Samsung's ad parts, reassign Home for good | 2 plus a Samsung bug that's still open, and on some models a kernel or graphics-driver bug | Medium to high on the kernel routes | Stops silently once Samsung fixes the bug | Remove the helper; a stock firmware reinstall from USB as the last resort | Likely voided for any damage; outside the DMCA exemption's clear cover | **No** |
| 5 | **One-off research exploits** (one model each) | Root on that one model | Security-research skill | High | No | Firmware reinstall (unverified) | Likely voided | **No** |
| 6 | **SamyGO** (the old Samsung hacking forum) | Root on 2008-2016 TVs | Old firmware | Medium-high | No | Firmware reinstall | Voided | Only for old TVs |
| 7 | **Service/factory menus** (key combinations on the remote) | Panel, region and shop-mode settings | The remote | Misconfiguration with no clean undo (stuck in shop mode, wrong panel settings) | - | Often none | - | **Never** |

## What each changes, in plain words

**2. Developer Mode.** Lets the computer whose address is typed in install and debug apps on the TV. Set back to
`127.0.0.1` after installing (the install steps do), only the TV itself can. That matters: Bishop Fox showed in
February 2026 that anyone who can connect to Developer Mode's port can run their own code on the TV (Samsung's bug
SVE-2025-50109, Tizen 5.5 to 9), so the address shouldn't be left pointing at a laptop. Developer Mode doesn't give
a shell, root or file access on a normal TV.

**3. Native Home.** Changes the TV's own setting for which app Home opens, through Developer Mode, no root. AeroTizen
saves the original values on the PC first, reads each change back, and undoes a failed write. It needs that saved
backup to restore, so the PC's folder has to be kept.

**4. Root.** `samsung-tv-root` gets a foothold through the open Developer Mode bug, then root through a second bug
that depends on the model. Nothing is written into the TV's firmware, so a full restart drops it; the PC (or
AeroTizen's helper on the TV) runs it again at every start. The base project lists many 2021-2026 models as working,
some only by owner reports. AeroTizen's version adds a hidden helper app that re-roots at each start and talks to the
PC over a paired, encrypted local connection; `root remove` takes it off.

## If something goes wrong

- **The app misbehaves:** delete it (Apps › gear › Delete), switch Developer Mode off.
- **Native Home goes wrong:** AeroTizen's restore, a 60-second power-off; if the PC backup is lost, a factory reset
  puts Samsung's Home back (and turns every privacy setting back on).
- **The TV won't start properly:** Samsung's official route is the latest firmware from the model's Samsung support
  page onto a USB stick (Settings › Support › Software Update › Update Now, with the USB stick in). Older firmware
  can't be put back: Samsung only offers the latest.

## Warranty and the law (US)

- Samsung's US TV warranty covers manufacturing defects and excludes "abnormal use". It doesn't name Developer Mode.
  Under the Magnuson-Moss Warranty Act a maker can refuse a repair caused by a modification, not the whole warranty
  for having made one. In practice: options 1-3 are very unlikely to matter; a TV damaged by option 4-5 wouldn't be
  repaired for free.
- The DMCA exemption for smart TVs (37 CFR 201.40(b)(10), renewed October 2024) allows getting around the TV's
  locks to run lawfully obtained apps. Options 2-3 fit it; kernel-level root is a grey area beyond it.

## Recommendation

Options 1 and 2 for the test TV. Option 3 only if AeroTizen confirms that TV's exact model and the project lead
picks it. Options 4-7: not in any guide; option 4 on someone's own TV would be a separate decision with its own
warning.

## Sources

- [Bishop Fox: Samsung Tizen OS through 9.0, SDB command injection](https://bishopfox.com/blog/samsung-tizen-os-version-through-9-0)
  (SVE-2025-50109, February 2026).
- [chris-ritsen/samsung-tv-root](https://github.com/chris-ritsen/samsung-tv-root) (compatibility table, persistence).
- [AeroTizen](https://github.com/helalaou/AeroTizen): README › Optional untethered root, Choose how Home works;
  docs/root-cli.md, docs/home-pc-flow.md (read at `093c2d5`).
- [StandardChartered/publications-samsung-tv](https://github.com/StandardChartered/publications-samsung-tv) (one model's kernel bug).
- [TizenBrew](https://github.com/reisxd/TizenBrew); Samsung [USB firmware update](https://www.samsung.com/us/support/answer/ANS10002051/);
  37 CFR 201.40(b)(10) ([89 FR 85437](https://www.federalregister.gov/documents/2024/10/28/2024-24563/exemption-to-prohibition-on-circumvention-of-copyright-protection-systems-for-access-control-technologies)).
- SamyGO: [forum.samygo.tv](https://forum.samygo.tv).
