# Settings cleanup (no computer needed)

Menu labels are from a 2024 model (UN65DU7200, Tizen 9.0, US). Samsung renames
things between years; 2025 models moved some of these under **Advanced Features**.

## 1. Boot past the ad-filled Home screen
`Settings > All Settings > General & Privacy > Start Screen Option`
- **Start with Smart Hub Home**: Off. The TV wakes to your last input instead of Home.
- **Autorun Last App**: Off (or On, if you want it to reopen YouTube etc.).
- **Autorun Samsung TV Plus**: Off, if listed.

## 2. Stop personalised "Top Picks" and targeted ads
`Settings > All Settings > General & Privacy > Terms & Privacy > Privacy Choices`
(older: `Settings > Support > Terms & Privacy`)
- **Viewing Information Services**: Off. This is ACR, which identifies what's on screen.
- **Interest-Based Advertisements**: Off.
- **Voice Recognition Services**: Off, unless you use voice.
- Anything named **Personalized Content**, **Customization Service** or **Recommendations**: Off.

## 3. Hide Samsung TV Plus
On Home, highlight **Samsung TV Plus**, press **Down** (or hold **OK**), then **Disable**.
It can't be uninstalled; disabling removes the icon and its channels.

## 4. Remove suggested apps from Home
On Home's **For You** / apps row: scroll to the end, **Edit List**, select an app,
press **Down**, then **Remove**.

## 5. Delete apps you never use
`Home > Apps > Settings (gear, top right) > select app > Delete`.
On Tizen 6+ this is the only way to remove store and preinstalled apps. The developer
connection (`sdb`) refuses with `can not uninstall app`.

## 6. Block ad servers with DNS
`Settings > All Settings > Connection > Network > Network Status > IP Settings`
- **DNS Setting**: Enter manually
- **DNS Server**: `94.140.14.14` (AdGuard DNS, free, no account)

Verified: AdGuard DNS blocks `samsungads.com` and `samsungacr.com`, and YouTube,
Netflix and the Samsung app store (`lcprd1.samsungcloudsolution.net`) still resolve.
For full control, load [`../dns/samsung-ads.txt`](../dns/samsung-ads.txt) into
Pi-hole, AdGuard Home or NextDNS instead.

To undo, set **DNS Setting** back to **Obtain automatically**.
