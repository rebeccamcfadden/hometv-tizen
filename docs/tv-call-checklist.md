# First TV call: what to do on the family's Samsung

For Rebecca, on the phone with the family member at the TV. About 45 minutes. Each step says what to press, what to
look at, and how to undo it. Nothing here changes the TV beyond what Part E undoes from the TV's own menus.

**What changes on their TV, in plain words:**

- **Developer Mode** (Samsung's own switch for app makers) goes on. It lets the computer whose address is typed in
  install apps on the TV. At the end that address is the TV itself (`127.0.0.1`), so no other computer can. It
  doesn't change the TV's software or its other settings.
- **One app, TizenBrew**, appears in the TV's apps. It's free software from a single developer, used by many people
  for TizenTube. HomeTV runs inside it.
- **HomeTV is added to TizenBrew** (Part C), and two TV settings may change in Part D. Everything goes back in Part E.
- **Nothing to do with the family's accounts or apps changes.** On 2023 and newer TVs, the installer asks for a
  Samsung account sign-in once, to make a certificate for that TV (Part B5).

**Results come back to you** through a page on their phone (Part C3): they copy it and send it to you. Only the TV's
model, Tizen and app names are on it: no serial number, no Wi-Fi name, no account.

## Before the call (you, on your own)

1. **Part C needs HomeTV on npm** (your answer to "publishing the Samsung module"). Without it, do Parts A, B, D2-D3
   and E, and HomeTV's checks wait for the next call.
2. Send them, a day ahead: the link to **TizenBrew Installer** for their computer
   (https://github.com/reisxd/TizenBrewInstaller/releases/latest: the file ending `-win-x64.exe` on Windows), and ask
   them to download it and have the computer on the same Wi-Fi as the TV.
3. Keep this list open, and a note to write down the answers marked ✍.

## Part A: look, change nothing (5 minutes)

1. ✍ **The TV's model:** Settings › Support › About This TV. Read out the **Model Code** (like `UN55TU7000`) and the
   **Software Version**. Not the serial number.
2. ✍ **Which streaming apps are on it:** press Home and read out the row of apps.
3. ✍ **Two settings as they are now**, to put back later: on 2017-2021 TVs Settings › General › Smart Features; on
   2022 and later Settings › All Settings › General & Privacy › Start Screen Options. Write down whether
   **Autorun Last App** and **Start with Smart Hub Home** are on or off.

## Part B: install TizenBrew (15 minutes)

1. **The computer's address.** On Windows: Settings › Network & internet › Wi-Fi › the network's properties ›
   **IPv4 address** (four numbers like `192.168.1.23`). ✍ Write it down for this call only.
2. **Developer Mode on.** On the TV, open **Apps** (Home › Apps). On the remote, press `1 2 3 4 5` (on a remote with
   no number keys: press the `123` button or the colour button for the on-screen numbers, then type them). A
   **Developer mode** box appears: switch it **On**, type the computer's address under **Host PC IP**, and press OK.
   - Nothing appears: the remote's numbers went somewhere else. Close and reopen Apps, then type again slowly.
3. **Restart the TV fully:** hold the remote's **power** button until the Samsung logo shows (about 5 seconds). A
   short press only puts it to sleep, and Developer Mode needs a real restart.
4. **Install.** On the computer, open TizenBrew Installer (Windows may warn: **More info › Run anyway**). Choose
   **Connect to TV** and type the TV's address if it asks (on the TV: Settings › General › Network › Network
   Status › IP Settings), then **Install TizenBrew**. It shows Fetching, Installing, then **Package installed**.
   - "Could not connect": Developer Mode's address doesn't match the computer, or the TV wasn't fully restarted.
     Check B1-B3.
5. **2023 and newer TVs only:** it says **Resigning required**. Press **Sign in to Samsung Account** and sign in
   (theirs, or a new free one). This makes a certificate for this one TV. ✍ If it shows a date the certificate ends,
   write it down.
6. **Developer Mode to the TV itself.** On the TV, Apps › `1 2 3 4 5` again. Change **Host PC IP** to `127.0.0.1`,
   OK, then restart fully again (hold power). The computer isn't needed after this.
7. **Open TizenBrew** (Apps, near the end of the row). It may close and reopen itself once: that's normal. ✍ Did it
   open, and how many seconds did it take?
   - "Could not connect to the SDB Daemon": Host PC IP isn't `127.0.0.1`, or restart fully (hold power) once more.

## Part C: HomeTV's checks (15 minutes; only if HomeTV is on npm)

1. **Add HomeTV.** In TizenBrew, go to the box icon at the top right (Modules), choose **Add NPM Module**, type
   `@rebeccamcfadden/hometv-tizen`, and press OK. Back on TizenBrew's first screen, open **HomeTV**.
   ✍ How many seconds until the row of apps shows?
2. **The checks screen:** press the **blue** button (or Info, or go down to **Checks for the TV call** and press OK).
   Press OK on **1. About this TV**, then **2. Which apps the TV lists**. Each line on the right turns green or red.
3. **The phone page:** on a phone on the same Wi-Fi, open the address the TV shows in yellow
   (`http://<numbers>:8766/report`). On the TV, press OK on **3. Phone reached the TV?** ✍ Did the page open on
   the phone? Keep that page open: it's how the results reach you.
4. **Open apps from Home.** Press Back to HomeTV's Home. Open **Netflix**. ✍ Did Netflix open? Then, inside Netflix,
   press Back until Netflix closes: ✍ where does it land (HomeTV, Samsung's Home bar, or TV)? To return, open
   TizenBrew again (it opens HomeTV after Part D1; before that, choose HomeTV in its list). Do the same for
   **YouTube** and one more app they have.
5. **Opening a title instead of the app's home:** back on the checks screen, press OK on 4 to 9, one at a time.
   Each opens an app. ✍ For each: did the **title** (Stranger Things, a YouTube video, The Boys) open, or only the
   app's home screen, or nothing? Come back to HomeTV after each (open TizenBrew).
   - On 5 and 9 the TV may ask whether to **allow "HomeTV"** to connect: choose **Allow** (Part E removes it).
6. **Send the results:** on the phone, reload the report page and send its text to you (copy all, or a screenshot).

## Part D: power-on (5 minutes)

1. **Open straight to HomeTV** (only after Part C): in TizenBrew, the gear icon (Settings) › **Autolaunch
   Settings** › HomeTV. Opening TizenBrew now goes straight to HomeTV (holding Up while it opens skips it).
2. **Autorun Last App on**, in the place from A3. Open HomeTV (or TizenBrew), then turn the TV **off with a short
   press**, wait 10 seconds, and turn it on. ✍ What shows first: HomeTV, Samsung's Home bar, or the TV channel?
3. Now **hold power** for a full restart, and turn it on again. ✍ What shows first this time?
4. Only after Part C: open HomeTV, Checks, press OK on **1. About this TV**, and send the phone page again. It says
   how many minutes HomeTV's service has been running: that tells us whether a short power-off keeps it running,
   which decides whether HomeTV can open without the internet.

## Part E: undo (whatever they don't want to keep)

Leave Developer Mode and TizenBrew on if the next call is coming, so it needn't be installed again. Otherwise, in
this order:

1. **The two settings from A3:** back to how they were.
2. **"HomeTV" allowed to connect** (only if C5 asked): Settings › General › External Device Manager › Device
   Connection Manager › Device List: select HomeTV, Delete.
3. **TizenBrew:** Apps › the gear (Settings) on the Apps screen › TizenBrew › **Delete** (on some TVs: select it
   in the Apps row, press and hold OK, Delete). Its settings go with it.
4. **Developer Mode off:** Apps › `1 2 3 4 5` › switch **Off** › OK, then restart fully (hold power).

## What to send back after the call

The ✍ answers, the phone page's text from C6 and D4, and anything that looked wrong (a photo of the screen is fine,
but crop out names, the Wi-Fi name and account details).
