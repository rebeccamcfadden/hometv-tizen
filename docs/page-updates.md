# Page updates

HomeTV on Samsung is its own app. A new **app** still needs the laptop (`aerotizen install`). But the **page** inside
it (the screens, their CSS and scripts) can update itself on the TV, without the laptop. This note says how, how
the project lead releases a page, and how to undo one.

Nothing is public yet: there is no update server, so apps are built with updates **off** unless you set an address.

## How it works

The app has two parts:

- **The shell**, fixed until the app itself is reinstalled: `dist/index.html`, `shell-config.js`, `boot.js`,
  `update.js` and TweetNaCl (`nacl-fast.min.js`). `shell-config.js` holds the app's version (from
  `tizen/config.xml`), the update address and the **public keys** a page must be signed with. A downloaded page can't
  change them.
- **The page**: everything else in `dist/` (HomeTV's script and styles, AeroTizen's scripts, images). The app comes
  with one; it can download newer ones.

At every start, `boot.js` (plain ES5, no network) picks the newest good page the TV has:

1. a page downloaded last time and not tried yet, else
2. the last page that started fine, else
3. the one before it, else
4. the page that came with the app.

It only uses a downloaded page that is newer than the app's own, was signed with a key this app trusts, needs no
newer app than this one, and hasn't failed. It reads that page's files from the app's private storage (`wgt-private/pages/<version>/`, through Tizen's
filesystem API: `openFile` on Tizen 5.0 and newer, the older `resolve` on Tizen 3 and 4) and puts them into the
installed `index.html` as inline styles and scripts. Images load from the same folder (a `<base>` address). The app
never goes to another web page, so it keeps `tizen`.

**Home never waits for the network.** Nothing is downloaded until Home has shown.

When Home shows, the page calls `HomeTVBoot.started()` (in `app/src/main.ts`). That marks the page as good. Ten
seconds later `update.js` loads and checks for a newer page (and again every 12 hours while HomeTV stays open):

1. It fetches `manifest.json` and `manifest.json.sig` from the update address.
2. It checks the signature (Ed25519, over the manifest's exact bytes) against the app's public keys. No match, no
   update.
3. It refuses a page for another app, one whose version isn't newer than every page the TV has, one that failed
   before, or one that needs a newer app.
4. It downloads each file from `<version>/<path>` beside the manifest, checks its size and SHA-512, and saves it.
   One bad file and the whole download is deleted.
5. Only when every file is saved does it note the page as ready. **It shows at the next start**, never in the
   middle of one.

The TV keeps **at most two** downloaded pages: the one in use and one more (the next, or the previous good one).

### When a new page fails

A new page has 30 seconds to reach Home. If it doesn't (it hangs, throws, or the TV goes off first), that start
counts as failed; after 30 seconds the app reloads. One failed start isn't enough to drop a page: people switch a TV
off in the first seconds. So:

- after the **first** failed start, the next start tries the same page again;
- after **two failed starts in a row**, the next start uses the previous good page (or the app's own), and that
  version is **skipped** from then on: it's never shown or downloaded again. Fix it as a new version.

A start that reaches Home clears the count. The same goes for a page that once worked. A page that hangs costs two
waits of 30 seconds before the TV goes back.

If a downloaded page's files are missing or damaged on the TV, the app uses the next best page at once, in the same
start. If the TV refuses inline scripts, downloaded pages are switched off for that app version and it keeps its own.

`HomeTVBoot.status()` (in the page) says which page is shown, why, and what the last check found.

## Releasing a page

Once, on your PC:

```sh
node tools/page-key.mjs
```

It saves the private key to `~/.hometv/page-key.pem` (outside the repo; it refuses to write inside it) and prints
the public key. Paste that line into `tizen/page-keys.txt`. Keep one more copy of the private key offline (a USB stick
in a drawer, or a password manager). Never put it in git, a chat or a cloud folder: whoever has it can send pages to
the TV. Then build the app with the update address and install it with the laptop as usual:

```sh
$env:HOMETV_UPDATE_URL='https://example.org/hometv/manifest.json'; npm run build
node tools/package-tizen.mjs
```

For each page release:

1. Raise `version` in `package.json` (for example `0.0.1` to `0.0.2`). Versions are three numbers.
2. `npm run build` (with the same `HOMETV_UPDATE_URL`).
3. `node tools/page-release.mjs --key $HOME\.hometv\page-key.pem`. It writes `.data/page-release/`: `manifest.json`,
   `manifest.json.sig` and a `<version>/` folder. The key can also come from `HOMETV_PAGE_KEY_FILE` (a path) or
   `HOMETV_PAGE_PRIVATE_KEY` (the key's text).
4. Upload the folder's contents to the update address's folder, **`manifest.json` last**.

The release needs the app version the page was built with (`tizen/config.xml`). If a page needs a newer app, the
TV keeps its current page until the app is reinstalled; `--min-shell x.y.z` sets that by hand.

When `tizen/config.xml`'s version changes (a new app), its own page should be at least as new as any page released
before, so raise `package.json`'s version too.

## Undoing a page

- **It doesn't start:** nothing to do. After two failed starts the TV goes back by itself and skips that version.
- **It starts but is wrong:** release the previous code again **with a higher version number** (check out the
  older code, raise the version past the bad one, build, release). TVs never go back to a lower number.
- **Everything off:** take `manifest.json` off the server. TVs keep the page they have and stop changing.
- **Back to the app's own page on one TV:** reinstall the app with its own page's version (`package.json`) at least
  as high as the downloaded one. This works whether or not reinstalling deletes the downloaded pages: a TV never shows
  a downloaded page that isn't newer than the app's own. If the server still offers a newer page, the TV downloads it
  again, so take that one off the server first (or release the fix above).
- **A lost or leaked key:** make a new pair, put the new public key in `tizen/page-keys.txt` (remove the old one),
  and reinstall the app with the laptop. TVs only trust the keys their app was built with, and each downloaded page
  remembers the key that signed it, so pages signed with the old key are no longer shown even if the reinstall keeps
  them; they're deleted once Home shows. Then release the page again with the new key (the same version is fine).

On the emulator (Tizen 10, 2026-11-04), **reinstalling over the app keeps its stored data**: the Checks screen's
results (in the page's localStorage) were still there after `tizen install` of a new build. So the page records
(also in localStorage) survive a reinstall. The page files in wgt-private aren't checked; if they went, the loader
fails to read them and falls back to the app's own page. Uninstalling isn't checked yet; the steps above don't
depend on either.

## Trying it on a PC

`npm test` runs the loader and the updater on the fake TV (both filesystem APIs, offline starts, bad signatures and
hashes, rollback). To try a real build against a local server:

```sh
node tools/page-serve.mjs --dev
```

It makes a test key in `.data/` (git-ignored, never for a real release), prints the build command that trusts it
with this PC's address, releases `dist/` and serves it on port 8790 (for the emulator, use the address it sees its
PC at). Build and install the app that way, raise `package.json`'s version, build again, and run the command again
to offer the newer page. `node tools/page-serve.mjs <folder>` serves any release folder.

## To check on Samsung (not yet seen on a TV or the emulator)

- Both filesystem APIs on real TVs, and `openFile` on the Tizen 10 emulator; whether `toURI` gives an address that
  images and CSS can load from.
- Inline scripts and styles in an installed app (a strict content security policy would stop them; the app notices and
  keeps its own page).
- `<base>` pointing at the private storage while the app runs from its install folder.
