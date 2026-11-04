# First TV call: what to do on the family's Samsung

For Rebecca, on the phone with the family member at the TV. About 40 minutes. Each step says what to press, what to
look at, and how to undo it. Nothing here changes the TV beyond what Part E undoes from the TV's own menus.

**This call (your answer, 18:22):** HomeTV isn't published yet, so this call installs TizenBrew and checks the TV's
basics. HomeTV's own checks wait for the second call ([at the end](#second-call-hometvs-own-checks)).

**What changes on their TV, in plain words:**

- **Developer Mode** (Samsung's own switch for app makers) goes on. It lets the computer whose address is typed in
  install apps on the TV. At the end that address is the TV itself (`127.0.0.1`), so no other computer can. It
  doesn't change the TV's software or its other settings.
- **One app, TizenBrew**, appears in the TV's apps. It's free software from a single developer, used by many people.
  HomeTV will run inside it.
- **Two TV settings may change** in Part D. Part E puts them back.
- **Nothing to do with the family's accounts or apps changes.** On 2023 and newer TVs, the installer asks for a
  Samsung account sign-in once, to make a certificate for that TV (Part B5).

## Before the call (you, on your own)

1. Send them, a day ahead, this link for their Windows laptop:
   https://github.com/reisxd/TizenBrewInstaller/releases/latest , the file **TizenBrewInstaller-win-x64.exe**. Ask
   them to download it and to have the laptop on the same Wi-Fi as the TV, plugged in.
2. Keep this list open, and a note for the answers marked ✍.

## Part A: look, change nothing (5 minutes)

1. ✍ **The TV's model:** Settings › Support › About This TV. Read out the **Model Code** (like `UN55TU7000`) and the
   **Software Version**. Not the serial number.
2. ✍ **Which streaming apps are on it:** press Home and read out the row of apps.
3. ✍ **Two settings as they are now**, to put back later. 2017-2021 TVs: Settings › General › Smart Features.
   2022-2024: Settings › All Settings › General & Privacy › Start Screen Options. 2025: Settings › All Settings ›
   Advanced Features › Start Screen Options. Write down whether **Autorun Last App** and **Start with Smart Hub
   Home** are on or off (a photo of the screen is easiest).

## Part B: install TizenBrew (15 minutes)

1. **The laptop's address.** Windows: Settings › Network & internet › Wi-Fi › the network's name › **IPv4 address**
   (four numbers like `192.168.1.23`). ✍ For this call only.
2. **Developer Mode on.** On the TV, open **Apps** (Home › Apps). On the remote, press `1 2 3 4 5` (no number keys:
   press the `123` button or a colour button for the on-screen numbers). A **Developer mode** box appears: switch it
   **On**, type the laptop's address under **Host PC IP**, press OK.
   - Nothing appears: close and reopen Apps, then type the numbers again slowly.
3. **Restart the TV fully:** hold the remote's **power** button until the Samsung logo shows (about 5 seconds). A
   short press only puts it to sleep, and Developer Mode needs a real restart.
4. **Install.** On the laptop, open TizenBrewInstaller (Windows may warn: **More info › Run anyway**). Choose
   **Connect to TV** and type the TV's address if it asks (TV: Settings › General › Network › Network Status ›
   IP Settings), then **Install TizenBrew**. It shows Fetching, Installing, then **Package installed**.
   - "Could not connect": the Host PC IP doesn't match the laptop, or the TV wasn't fully restarted. Check B1-B3.
5. **2023 and newer TVs only:** it says **Resigning required**. Press **Sign in to Samsung Account** and sign in
   (theirs, or a new free one). This makes a certificate for this one TV. ✍ If a date the certificate ends shows,
   write it down.
6. **Developer Mode to the TV itself.** On the TV, Apps › `1 2 3 4 5` again. Change **Host PC IP** to `127.0.0.1`,
   OK, then restart fully again (hold power). The laptop isn't needed after this.
7. **Open TizenBrew** (Apps, near the end of the row). It may close and reopen itself once: that's normal.
   ✍ Did it open, and in how many seconds?
   - "Could not connect to the SDB Daemon": Host PC IP isn't `127.0.0.1`; fix it and restart fully once more.

## Part C: what a module can do on this TV (10 minutes)

TizenBrew comes with one module already in its list, **TizenTube** (a YouTube player). Opening it tests the same
things HomeTV needs: that a module opens, how fast, and whether a phone can reach a module's background part.
Nothing gets installed; Part E removes it from the list if they don't want it. (Not in the list? Modules › **Add NPM
Module** › `@foxreis/tizentube` › OK.)

1. In TizenBrew, open **TizenTube**. ✍ How many seconds until YouTube's screen shows? Does scrolling feel smooth?
2. **The phone check:** on a phone on the same Wi-Fi, open `http://<the TV's address>:8085/dial/apps/YouTube`
   (the TV's address from B4). ✍ Does the phone show a page of text starting with `<?xml` (good: a phone can reach a
   module on this TV), or "can't connect"?
3. Press the remote's **Home** button, then open **Netflix** from Samsung's row, then press Back until Netflix
   closes. ✍ Where does it land: Samsung's Home bar, the TV channel, or TizenBrew?

## Part D: power-on (5 minutes)

1. Turn **Autorun Last App** on, in the place from A3.
2. Open TizenBrew, then turn the TV **off with a short press**, wait 10 seconds, and turn it on. ✍ What shows first:
   TizenBrew, Samsung's Home bar, or the TV channel?
3. Now **hold power** for a full restart, then turn it on again. ✍ What shows first this time?

## Part E: undo (whatever they don't want to keep)

**Recommended:** leave Developer Mode and TizenBrew on until the second call, so the laptop isn't needed again; put
back only the settings. Otherwise, in this order:

1. **The two settings from A3:** back to how they were.
2. **TizenTube** (only if they don't want it): in TizenBrew, the box icon at the top right (Modules), select
   TizenTube, OK, confirm Remove.
3. **TizenBrew:** Apps › the gear (Settings) on the Apps screen › TizenBrew › **Delete** (on some TVs: select it in
   the Apps row, hold OK, Delete). Its settings go with it.
4. **Developer Mode off:** Apps › `1 2 3 4 5` › switch **Off** › OK, then restart fully (hold power).

## What to send back after the call

The ✍ answers, and anything that looked wrong (a photo of the screen is fine; crop out names, the Wi-Fi name and
account details).

## Second call: HomeTV's own checks

Once HomeTV is published (a later decision for you), in TizenBrew: Modules › **Add NPM Module** › the package name ›
OK, then open **HomeTV** and press the **blue** button (or Info) for its Checks screen. Each check writes its result
on screen and on a page the phone opens (`http://<the TV's address>:8766/report`), so the phone sends the results:

1. About this TV (model, Tizen version, the service's Node version and uptime).
2. Which apps the TV lists for HomeTV.
3. The phone reached the TV.
4. to 9. Opening a title (Netflix, YouTube, Prime Video) three ways: ✍ for each, did the **title** open, the app's
   home screen, or nothing? On 5 and 9 the TV may ask to **allow "HomeTV"**: Allow (undo: Settings › General ›
   External Device Manager › Device Connection Manager › Device List › HomeTV › Delete).

Then: open apps from HomeTV's row; TizenBrew's gear › **Autolaunch Settings** › HomeTV, so opening TizenBrew goes
straight to HomeTV; and Part D again with HomeTV open.
