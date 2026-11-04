# Samsung TV: turning off tracking, analytics and ads

Research for Rebecca, 2026-11-04. Nothing here has been run on any TV. It goes further than upstream's guide
([cleanyour.tv/not-android](https://cleanyour.tv/not-android)), which covers the main switches and a DNS table.
Every step says what it stops, what it can break, and how to undo it.

## The short version

1. **Settings with the remote** (15 minutes, no risk): viewing information (ACR) off, interest-based ads off, the ad
   ID reset, voice review off, Samsung TV Plus off, Smart Hub not first at power-on, unused apps deleted. A 2024
   university study measured that the ACR opt-out really stops the TV sending what's on screen.
2. **A DNS blocker** (optional, more effort): blocks Samsung's ad and ACR servers for the whole TV, including what
   the switches miss. The simplest: type a free blocking DNS address into the TV. Better: a list on the router.
   Never block the update, clock or sign-in addresses.
3. **What stays, whatever you do:** ads inside apps (Netflix's ad plan, YouTube, Tubi), the "recommended" row in
   Samsung's home bar on 2023+ TVs, the Samsung account requirement for apps on 2023+ TVs, and update check-ins.
   A home screen like HomeTV hides the home bar; nothing removes it ([launcher-replacement.md](launcher-replacement.md)).
4. **Check again after a factory reset** (it turns everything back on) **and after big Samsung updates** (one report
   of interest-based ads switched back on; low confidence, cheap to check).
5. **Scripts:** a script can't set these switches directly: Samsung has no way in for that. A script can press the
   remote's keys through the menus, but menus differ by year and Samsung has broken that remote connection before.
   What's worth scripting is a **check**, not the clicking: see [Scripts](#what-can-be-scripted).

## 0. Before changing anything

- **Photograph each settings screen before changing it.** That's the backup: Samsung TVs have no settings export.
- Find the TV's year: Settings › Support › About This TV › Model Code. The letter after the size says the year on
  US models: `TU` 2020, `AU` 2021, `BU`/`Q60B` 2022, `CU` 2023, `DU` 2024, `U`…`F` 2025. Menus move between years.

## 1. Settings with the remote

Paths for US TVs. Samsung renames things between years, so search the menu's words if a path doesn't match.

| Year | Where the privacy switches are |
|---|---|
| 2017-2021 | Settings › General › Terms & Privacy (older: Settings › Support › Terms & Policy) |
| 2022-2024 | Settings › All Settings › General & Privacy › Terms & Privacy › Privacy Choices |
| 2025 (Tizen 9) | Settings › All Settings › General & Privacy (or Privacy Choices on the main menu) |

| Switch | Turn it | What it stops | What it breaks | Undo |
|---|---|---|---|---|
| **Viewing Information Services** | Off | ACR: the TV recognising what's on screen (live TV, HDMI, apps) and reporting it for ads | Nothing that works; "recommended for you" gets less personal | Turn it on |
| **Interest-Based Advertisement** (2025: Personalized ads) | Off | Ads chosen from your viewing profile | Nothing: ads still show, untargeted | Turn it on |
| **Reset PSID / Reset ad ID** (same screen) | Press once | Cuts off the profile built so far | Nothing | Nothing to undo |
| **Voice Recognition Services** | Off, only if nobody uses voice | Voice data going to Samsung | Voice search and Bixby/Alexa stop | Turn it on |
| **Bixby › Privacy: audio recording review, voiceprint review** | Off | People or AI reviewing voice recordings | Nothing: voice still works | Turn it on |
| Anything called **Personalized Content**, **Customization Service**, **Recommendations** (if listed) | Off | Personalised rows | Less personal rows | Turn it on |
| **Vision AI Companion** terms (2025) | Disagree, if nobody uses it | The new AI assistant's data | The AI assistant | Agree again |
| **Smart Hub Terms & Conditions / Privacy Notice** | **Leave agreed** | - | **Every app stops** (Netflix, YouTube…): only TV and HDMI work | Agree again |

**Start-up** (2017-2021: Settings › General › Smart Features; 2022-2024: General & Privacy › Start Screen Options;
2025: Advanced Features › Start Screen Options):

| Switch | Turn it | Effect | Undo |
|---|---|---|---|
| **Start with Smart Hub Home** (older: Autorun Smart Hub) | Off | The TV wakes to the last input or app instead of the ad-filled home bar | On |
| **Autorun Samsung TV Plus** (if listed) | Off | TV Plus stops playing by itself at power-on | On |
| **Autorun Last App** | The household's choice | On reopens the last app (HomeTV, once it's on the TV) | Back as it was |

**On the home bar:**

| Step | How | Effect | Undo |
|---|---|---|---|
| **Samsung TV Plus** | Highlight it, press Down (or hold OK), **Disable** | Its tile and channels go (it can't be deleted) | Apps › TV Plus › Enable |
| **Suggested apps on the row** | End of the row › Edit List › select › Down › Remove | Promoted tiles go | Add them back from Apps |
| **Apps nobody uses** | Apps › gear (Settings) › the app › Delete | Frees space; no background updates for it | Reinstall from Apps |

Leave **Samsung's own system apps** alone: some show in Apps' settings without a Delete button for a reason. A
2018 debloat report found that removing the low-memory Netflix helper stopped Netflix opening.

## 2. Network: blocking Samsung's tracking servers

Settings only switch off what Samsung lets you. A DNS blocker stops the TV finding the tracking servers at all.
Three ways, easiest first:

**a. Type a blocking DNS into the TV** (5 minutes, nothing to install). Settings › General (2022+: Connection) ›
Network › Network Status › IP Settings › DNS Setting › **Enter manually** › `94.140.14.14` (AdGuard's free DNS).
AeroTizen checked that it blocks `samsungads.com` and `samsungacr.com` while YouTube, Netflix and the app store
still work. **Undo:** DNS Setting › Obtain automatically. The catch: only this TV, AdGuard's choice of what to
block, and a TV may fall back to Google's `8.8.8.8` when it can't reach it.

**b. A blocking DNS for the whole home** (NextDNS, or Pi-hole/AdGuard Home on an always-on computer), with a Samsung
list. Upstream's guide explains the set-up; the lists:

| List | Size | Notes |
|---|---|---|
| [AeroTizen `samsung-ads.txt`](https://github.com/helalaou/AeroTizen/blob/main/dns/samsung-ads.txt) | 18 names | **Recommended to start:** ads, ACR and usage telemetry only; says the store, sign-in, updates and casting keep working |
| [HaGeZi `native.samsung`](https://github.com/hagezi/dns-blocklists) | ~190 names | Maintained; broader (Samsung phones' and Adobe's analytics too) |
| [Perflyst `SmartTV.txt`](https://github.com/Perflyst/PiHoleBlocklist) | all brands | Its comments say which names *not* to block |
| [AeroTizen `samsung-aggressive.txt`](https://github.com/helalaou/AeroTizen/blob/main/dns/samsung-aggressive.txt) | 25 names | **Not for a family TV:** stops firmware updates, some app downloads, sign-in and SmartThings |

**Never block** (all sources agree): `samsungotn.net` and `otnprd*.samsungcloudsolution.net` (security updates),
`time.samsungcloudsolution.com` (the clock; Plex, YouTube and Prime Video fail without it), all of
`samsungcloudsolution.com` (the TV loses its connection), `auth.samsungosp.com` (sign-in), and
`osb-ussvc.samsungqbe.com` if anyone watches TV Plus. `lcprd1.samsungcloudsolution.net`: one person had to allow it
again for app downloads; AeroTizen's list leaves it alone.

**c. Catch the TV going around the blocker.** If the blocker's log shows nothing from the TV, it's asking another
DNS directly. A router rule that sends all DNS to the blocker fixes that (upstream's guide links router guides);
most internet-provider routers can't.

**And separately:** a **guest or IoT network** for the TV keeps it away from the home's computers and phones (casting
from a phone then needs the phone on the same network). Undo: join the main Wi-Fi again.

## 3. Deleting Samsung's own extras

- **On the TV** (any year): Apps › gear › Delete works for store apps and some preinstalled ones. That's the safe way.
- **Over Developer Mode's connection** (`sdb uninstall`): on 2018 TVs it removed some preinstalled apps, and the
  removal lasted through restarts; on Tizen 6 (2021) and newer it's refused. Samsung's ad and ACR parts
  (`org.tizen.acr-service-app`, `org.tizen.ADPlayer`, the home-row preview services) are protected system parts:
  they can't be removed this way, and trying risks the home bar. So deleting apps is tidying, not privacy: the
  switches and DNS do the privacy part.
- **Reset Smart Hub** (Support › Device Care › Self Diagnosis) and factory reset bring every preinstalled app back.

## What can be scripted

Without root, nothing can set Samsung's privacy switches directly: no local or SmartThings command exists for them
(SmartThings only does picture, sound, volume and power). What's possible:

| Script | How | Worth it? |
|---|---|---|
| **Press the keys through the menus** | Samsung's local remote connection (`samsungtvws`, port 8002) after the TV's "Allow" prompt | **No, as an unattended script.** Menus differ by year and firmware, a script can't see the screen, the Allow prompt may come back after every restart, and Samsung broke this connection on purpose in at least one 2021 firmware. |
| **A guided checklist on the TV** | HomeTV shows each step ("press Settings, then …") with a photo per TV year, and a tick per step; nothing pressed for them | **Yes:** fits a family call; HomeTV can't open Samsung's settings pages, but it can walk someone through them |
| **A check from a phone or PC** | Ask the home network's DNS for the tracking names (blocked?) and the "never block" names (still there?), like upstream's network check | **Yes:** small, read-only, catches a too-broad list |
| **Read-only TV status** | `GET http://<tv>:8001/api/v2/` gives the model, Developer Mode, power state | Yes, for the guide to pick the right year's photos |
| **Tidy apps from a PC** | AeroTizen's tool: `aerotizen apps` / `debloat` | Only Tizen 5.5 and older remove anything; deleting on the TV is simpler |

**Recommendation:** a printable/phone checklist (this document's tables, in the family's TV year only), the TV's
own DNS set to AdGuard as the one network step, and a small read-only network check. No key-pressing script.

## What can't be removed

- Ads inside apps (Netflix's ad plan, YouTube, Tubi, Pluto): the app's own, not the TV's.
- The "recommended" row in Samsung's home bar on 2023+ TVs: no switch; a home screen like HomeTV covers it.
- Update check-ins: blocking them stops security updates.
- On 2023+ TVs, apps need the Smart Hub terms and a Samsung account.
- After a factory reset everything is back on; after big updates, check the privacy screen again.

## Sources

- IMC 2024: Ghosh et al., [Watching TV with the Second-Party](https://arxiv.org/abs/2409.06203) (ACR opt-out stops ACR traffic).
- Upstream: [cleanyour.tv/not-android](https://cleanyour.tv/not-android), [docs/devices/samsung-tizen.md](https://github.com/Gathin23/cleanyourtv/blob/main/docs/devices/samsung-tizen.md).
- AeroTizen: [docs/settings.md](https://github.com/helalaou/AeroTizen/blob/main/docs/settings.md), [dns/](https://github.com/helalaou/AeroTizen/tree/main/dns), README › Limits.
- Samsung: [Smart Hub terms and apps](https://www.samsung.com/in/support/tv-audio-video/unable-to-use-apps-from-samsung-tv-smart-hub-home/),
  [privacy settings](https://www.samsung.com/hk_en/support/tv-audio-video/how-to-adjust-privacy-settings-on-your-samsung-smart-tv/),
  [Start Screen Options](https://www.samsung.com/ae/support/tv-audio-video/use-autorun-start-screen-options-on-your-samsung-tv/),
  [reset](https://www.samsung.com/latin_en/support/tv-audio-video/reset-my-samsung-tv/).
- Lists: [HaGeZi](https://github.com/hagezi/dns-blocklists), [Perflyst SmartTV.txt](https://raw.githubusercontent.com/Perflyst/PiHoleBlocklist/master/SmartTV.txt).
- Debloat: [ardazeytin/samsung-tizen-tv-debloat](https://github.com/ardazeytin/samsung-tizen-tv-debloat) (UE55NU7400, 2018).
- Remote connection: [samsung-tv-ws-api](https://github.com/xchwarze/samsung-tv-ws-api) issues
  [#127](https://github.com/xchwarze/samsung-tv-ws-api/issues/127), [#184](https://github.com/xchwarze/samsung-tv-ws-api/issues/184).
