"""HomeTV Check for Samsung TVs: learns, once, whether HomeTV will install and work on this TV.

Run on a Windows laptop on the same home network as the TV, with the TV's Developer Mode on (the instructions page,
site/check/index.html, says how). It:

  1. checks the laptop (Windows, the network) and finds the TV,
  2. reads the TV's model and software (only what the report allows: report-schema.json),
  3. backs up what the TV says about itself and its list of apps, into a new folder (check_backup.py), before
     anything is installed,
  4. makes the TV's certificate: you sign in to your Samsung account in the browser (AeroTizen's `certs` step),
  5. signs and installs the small check app ("HomeTV Check"), and starts it,
  6. waits while you follow the TV's screen, then reads the TV's results,
  7. removes the check app again, and
  8. writes HomeTV-check-report-<date>.txt and .json on the Desktop.

Nothing else on the TV changes. Built on AeroTizen's CLI (MIT, vendor/aerotizen/cli), unmodified.

  hometv_check.py                       the real thing
  hometv_check.py --backup-only         only step 3 (and what it needs): nothing is installed
  hometv_check.py --dry-run             walk through every step without a TV (fake answers), for testing
  hometv_check.py --host 192.168.1.50   use this TV (or an emulator), don't search the network
"""

import argparse
import contextlib
import datetime
import ipaddress
import json
import os
import platform
import shutil
import socket
import sys
import tempfile
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOL_VERSION = "1.0.0"


def _paths():
    """AeroTizen's package: in the Windows bundle it's on the path already (python._pth); in the repo, vendor/."""
    repo_src = HERE.parent.parent / "vendor" / "aerotizen" / "cli" / "src"
    if (repo_src / "aerotizen").is_dir() and str(repo_src) not in sys.path:
        sys.path.insert(0, str(repo_src))
    if str(HERE) not in sys.path:
        sys.path.insert(0, str(HERE))


_paths()

import check_backup  # noqa: E402
import check_report  # noqa: E402

APP_ID = "HmTvCheck0.HomeTVCheck"
WATCHER_PORT = 47791
PAGES_PORT = 8766
WGT_NAME = "HomeTV-Check-App.wgt"
WGT_PLACES = (
    HERE.parent / WGT_NAME,  # the Windows bundle: next to app/
    HERE / WGT_NAME,
    HERE.parent.parent / "release" / "check-samsung-v1" / WGT_NAME,  # the repo, after package-check.mjs
)
CERT_FILES = ("author.p12", "distributor.p12", "password.txt")


# ---------------------------------------------------------------- talking to the person


class Person:
    """Plain words on the screen; Enter to go on. In a dry run nothing waits."""

    def __init__(self, auto):
        self.auto = auto
        self.step_no = 0

    def step(self, title):
        self.step_no += 1
        print()
        print("=" * 72)
        print(f" Step {self.step_no}. {title}")
        print("=" * 72)

    def say(self, *lines):
        for line in lines:
            print("  " + line if line else "")

    def wait(self, prompt="Press Enter to go on."):
        if self.auto:
            print(f"  [{prompt} (dry run: going on)]")
            return ""
        try:
            return input(f"  >> {prompt} ").strip()
        except EOFError:
            return ""

    def ask_yes(self, prompt):
        if self.auto:
            print(f"  [{prompt} (dry run: yes)]")
            return True
        return self.wait(prompt + " Type y and Enter for yes, or just Enter for no.").lower().startswith("y")

    def stopped_waiting(self):
        """True once Enter was pressed (Windows), without blocking."""
        if self.auto:
            return False
        try:
            import msvcrt
        except ImportError:
            return False
        hit = False
        while msvcrt.kbhit():
            if msvcrt.getwch() in ("\r", "\n"):
                hit = True
        return hit


# ---------------------------------------------------------------- the laptop


def local_ipv4s():
    """This laptop's own IPv4 addresses (for comparing with the TV's Host PC IP; never written to the report)."""
    found = set()
    with contextlib.suppress(OSError):
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            found.add(info[4][0])
    with contextlib.suppress(OSError):
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("192.0.2.1", 9))  # no packet is sent: this only picks the outgoing interface
            found.add(s.getsockname()[0])
    return sorted(a for a in found if not a.startswith("127."))


def address_towards(host):
    """The laptop's address on the way to the TV: the one to type as Host PC IP."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect((host, 26101))
            return s.getsockname()[0]
    except OSError:
        addrs = local_ipv4s()
        return addrs[0] if addrs else ""


def is_private(addr):
    with contextlib.suppress(ValueError):
        return ipaddress.ip_address(addr).is_private
    return False


def desktop():
    """The Desktop folder, where Windows really keeps it (OneDrive may move it)."""
    if os.name == "nt":
        with contextlib.suppress(Exception):
            import ctypes
            from ctypes import wintypes

            class GUID(ctypes.Structure):
                _fields_ = [("a", wintypes.DWORD), ("b", wintypes.WORD), ("c", wintypes.WORD), ("d", ctypes.c_ubyte * 8)]

            # FOLDERID_Desktop {B4BFCC3A-DB2C-424C-B029-7FE99A87C641}
            fid = GUID(0xB4BFCC3A, 0xDB2C, 0x424C, (ctypes.c_ubyte * 8)(0xB0, 0x29, 0x7F, 0xE9, 0x9A, 0x87, 0xC6, 0x41))
            out = ctypes.c_wchar_p()
            if ctypes.windll.shell32.SHGetKnownFolderPath(ctypes.byref(fid), 0, None, ctypes.byref(out)) == 0:
                path = out.value
                ctypes.windll.ole32.CoTaskMemFree(out)
                if path and os.path.isdir(path):
                    return Path(path)
    home = Path.home()
    return home / "Desktop" if (home / "Desktop").is_dir() else home


def windows_version():
    if os.name == "nt":
        v = sys.getwindowsversion()
        return f"{v.major}.{v.minor}.{v.build}"
    return platform.release().split("-")[0]


# ---------------------------------------------------------------- the TV, through AeroTizen


class Tv:
    """The TV, through AeroTizen's CLI package (unmodified). One Developer Mode connection at a time."""

    def __init__(self, host, sdb_port):
        from aerotizen.sdb import PORT

        self.host = host
        self.sdb_port = sdb_port or PORT

    def session(self, timeout=15):
        from aerotizen.device import DeviceSession

        return DeviceSession(self.host, port=self.sdb_port, timeout=timeout).connect()

    def info(self):
        """The TV's own description (port 8001), or {} when it doesn't answer (the emulator)."""
        return (self.description() or {}).get("device", {})

    def description(self):
        """The whole of /api/v2/ (http on 8001, else https on 8002), or None when neither answers. Read-only. The
        TV's certificate on 8002 is its own, self-signed, so it isn't checked: only this one GET goes over it."""
        import ssl
        import urllib.request

        for url, ctx in ((f"http://{self.host}:8001/api/v2/", None), (f"https://{self.host}:8002/api/v2/", ssl._create_unverified_context())):
            try:
                with urllib.request.urlopen(url, timeout=5, context=ctx) as r:
                    answer = json.load(r)
                if isinstance(answer, dict):
                    return answer
            except (OSError, ValueError):
                continue
        return None

    def http_get(self, session, port, path):
        """One GET to a service on the TV's own 127.0.0.1, through Developer Mode (AeroTizen's tcp_request).
        Returns (status, body) or (0, b'') when nothing answers."""
        request = (
            f"GET {path} HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n"
            "X-HomeTV-Check: 1\r\n\r\n"
        ).encode()
        try:
            raw = session.tcp_request(port, request, timeout=5, max_output=65536)
        except Exception:  # the TV closes the stream when nothing listens
            return 0, b""
        head, _, body = raw.partition(b"\r\n\r\n")
        try:
            status = int(head.split(b" ", 2)[1])
        except (IndexError, ValueError):
            return 0, b""
        return status, body


def tv_facts(device, caps):
    """The TV's model and software from its description and Developer Mode capabilities, allowlisted."""
    model = device.get("model") or ""
    year = None
    if len(model) > 3 and model[:2].isdigit() and model[2] == "_":
        year = 2000 + int(model[:2])
    return {
        "modelName": device.get("modelName"),
        "model": model or None,
        "year": year,
        "os": device.get("OS"),
        "platformVersion": caps.get("platform_version"),
        "profile": caps.get("profile_name"),
        "cpuArch": caps.get("cpu_arch"),
        "sdbdVersion": caps.get("sdbd_version"),
    }


def app_ids(applist_text, store_ids=False):
    """The TV's app ids; with store_ids, Samsung's store ids too (newer TVs list both: 111299001912 is YouTube's)."""
    from aerotizen import catalog

    apps = catalog.parse_applist(applist_text)
    if not store_ids:
        return [a["appid"] for a in apps]
    return [x for a in apps for x in (a["appid"], a.get("store_id")) if x]


# ---------------------------------------------------------------- the check


class Check:
    def __init__(self, args):
        self.args = args
        self.dry = args.dry_run
        self.person = Person(auto=self.dry)
        self.started = time.monotonic()
        self.laptop = {
            "tool": TOOL_VERSION,
            "date": datetime.date.today().isoformat(),
            "windows": windows_version(),
            "python": platform.python_version(),
        }
        self.tv_report = {}
        self.tv_answer = None
        self.app_list = None
        self.backup_folder = None
        self.cert_dir = None
        self.tv = None
        self.installed = False
        self.out_dir = Path(args.out) if args.out else (Path.cwd() / "dry-run-report" if self.dry else desktop())

    # -- the steps --------------------------------------------------------------------------------------------

    def run(self):
        print()
        print("HomeTV Check for Samsung TVs")
        print("Work in progress: not tested on a real TV yet.")
        if self.dry:
            print("DRY RUN: no TV is used; every answer is made up. The report goes to " + str(self.out_dir))
        try:
            self.laptop_check()
            host = self.find_tv()
            if host:
                self.tv = None if self.dry else Tv(host, self.args.sdb_port)
                connected = self.developer_mode(host) and self.connect_and_read(host)
                # The backup comes before anything is installed (docs/backup.md).
                self.backup()
                if connected and not self.args.backup_only:
                    if self.certificate() and self.install_and_start():
                        self.service_checks_from_laptop()
                        self.wait_for_tv()
                        self.fetch_report()
                    self.remove_check_app()
        except KeyboardInterrupt:
            print("\n  Stopped. Removing the check app if it's on the TV…")
            self.remove_check_app()
        except Exception as e:  # something unforeseen: still remove the app and write what we have
            print(f"\n  Something went wrong: {type(e).__name__}: {e}")
            with contextlib.suppress(Exception):
                self.remove_check_app()
        self.laptop["minutes"] = max(0, round((time.monotonic() - self.started) / 60))
        if self.args.backup_only:
            self.finish_backup_only()
            return
        self.finish()

    def laptop_check(self):
        p = self.person
        p.step("This laptop")
        try:
            import aerotizen

            self.laptop["aerotizen"] = aerotizen.__version__
        except ImportError:
            p.say("AeroTizen's files are missing from this folder. Download the tool again.")
            raise SystemExit(1)
        addrs = local_ipv4s()
        self.laptop["network"] = "private" if any(is_private(a) for a in addrs) or self.dry else "none"
        p.say(f"Windows {self.laptop['windows']}, Python {self.laptop['python']}, AeroTizen {self.laptop['aerotizen']}.")
        if self.laptop["network"] == "none":
            p.say(
                "This laptop doesn't seem to be on a home network. Connect it to the same Wi-Fi as the TV",
                "(or plug it into the router), then start this tool again.",
            )
            p.wait()

    def find_tv(self):
        p = self.person
        p.step("Finding the TV")
        if self.args.host:
            self.laptop["tvFound"] = "given"
            p.say(f"Using the TV at {self.args.host}.")
            return self.args.host
        if self.dry:
            self.laptop["tvFound"] = "one"
            p.say("Found: 1 Samsung TV (made up).")
            return "192.168.1.50"
        from aerotizen import discover

        while True:
            p.say("Looking for Samsung TVs on this network (a few seconds)…")
            tvs = discover.discover()
            if len(tvs) == 1:
                self.laptop["tvFound"] = "one"
                p.say(f"Found: {tvs[0].get('model') or 'a Samsung TV'} at {tvs[0]['ip']}.")
                return tvs[0]["ip"]
            if len(tvs) > 1:
                self.laptop["tvFound"] = "several"
                p.say("Found more than one Samsung TV:")
                for i, tv in enumerate(tvs, 1):
                    p.say(f"  {i}. {tv.get('model') or 'Samsung TV'} at {tv['ip']}")
                answer = p.wait("Type the number of the TV you're sitting at, then Enter.")
                if answer.isdigit() and 1 <= int(answer) <= len(tvs):
                    return tvs[int(answer) - 1]["ip"]
                continue
            self.laptop["tvFound"] = "none"
            p.say(
                "No Samsung TV answered. Check that:",
                " - the TV is on (not just asleep with a black screen),",
                " - the laptop is on the same Wi-Fi as the TV.",
                "If you know the TV's address (TV: Settings > General > Network > Network Status > IP Settings),",
                "you can type it now.",
            )
            answer = p.wait("Type the TV's address and Enter, or just Enter to look again, or q and Enter to stop.")
            if answer.lower() == "q":
                return None
            if answer:
                return answer

    def developer_mode(self, host):
        p = self.person
        p.step("Developer Mode on the TV")
        mine = address_towards(host) if not self.dry else "192.168.1.23"
        while True:
            d = {"developerMode": "1", "developerIP": mine} if self.dry else self.tv.info()
            if not d:
                self.laptop["developerMode"] = "unknown"
                self.laptop["hostPcIp"] = "unknown"
                p.say("The TV doesn't describe itself (an emulator, or an older TV). Going on.")
                return True
            on = str(d.get("developerMode")) == "1"
            self.laptop["developerMode"] = "on" if on else "off"
            dev_ip = d.get("developerIP") or ""
            self.laptop["hostPcIp"] = "this-laptop" if dev_ip and dev_ip in (local_ipv4s() + [mine]) else ("other" if dev_ip else "unknown")
            if on and self.laptop["hostPcIp"] != "other":
                p.say("Developer Mode is on, and lets this laptop in.")
                return True
            p.say(
                "Developer Mode needs to be on, with this laptop's address. On the TV:",
                " 1. Open Apps (Home, then Apps).",
                " 2. On the remote, press 1 2 3 4 5 (no number buttons? press 123, or a colour button, for the",
                "    numbers on screen). A 'Developer mode' box appears.",
                " 3. Switch it On. Under 'Host PC IP' type this laptop's address:",
                f"        {mine}",
                " 4. Press OK, then restart the TV fully: hold the remote's power button until the Samsung logo",
                "    shows (about 5 seconds). A short press only puts it to sleep.",
            )
            if not on:
                p.say("(The TV says Developer Mode is off.)")
            else:
                p.say("(Developer Mode is on, but with another computer's address.)")
            answer = p.wait("When the TV is back on, press Enter. (q and Enter to stop.)")
            if answer.lower() == "q":
                return False

    def connect_and_read(self, host):
        p = self.person
        p.step("Reading the TV's model and apps")
        if self.dry:
            self.laptop["sdb"] = "connected"
            self.laptop["tv"] = {"modelName": "UE43TU7000", "model": "20_MUSEL_UHD", "year": 2020, "os": "Tizen",
                                 "platformVersion": "5.5", "profile": "tv", "cpuArch": "armv7", "sdbdVersion": "2.2.31"}
            self.laptop["apps"] = {"count": 42, "known": check_report.known_from_app_ids(["111299001912", "3201907018807"])}
            p.say("Samsung UE43TU7000 (made up), Tizen 5.5. 42 apps, with YouTube and Netflix.")
            self.duid = "dry-run"
            self.tv_answer = dry_tv_answer()
            self.app_list = [{"appid": "111299001912", "name": "YouTube", "version": "2.1.497"},
                             {"appid": "3201907018807", "name": "Netflix", "version": "5.2.1"}]
            return True
        from aerotizen.sdb import SdbError

        for attempt in range(2):
            try:
                with self.tv.session() as s:
                    caps = s.capability()
                    self.duid = s.duid()
                    applist = s.applist()
                break
            except (SdbError, OSError) as e:
                self.laptop["sdb"] = "refused"
                p.say(
                    "The TV didn't let the laptop in. Usually the TV wasn't fully restarted after Developer Mode",
                    "was switched on, or Host PC IP doesn't match this laptop's address. Restart it fully (hold",
                    "power about 5 seconds) and try again.",
                    f"(Details: {e})",
                )
                if attempt == 0 and p.wait("Press Enter to try again, or q and Enter to stop.").lower() != "q":
                    continue
                return False
        self.laptop["sdb"] = "connected"
        self.tv_answer = self.tv.description()
        device = (self.tv_answer or {}).get("device")
        self.laptop["tv"] = tv_facts(device if isinstance(device, dict) else {}, caps)
        ids = app_ids(applist)
        from aerotizen import catalog

        self.app_list = catalog.parse_applist(applist)
        known = check_report.known_from_app_ids(app_ids(applist, store_ids=True))
        self.laptop["apps"] = {"count": len(ids), "known": known}
        t = check_report.clean(self.laptop["tv"], check_report.SCHEMA["laptop"]["tv"]) or {}
        p.say(f"TV: {t.get('modelName', 'Samsung')}, Tizen {t.get('platformVersion', '?')}. {len(ids)} apps on it.")
        return True

    def backup(self):
        """The TV's backup (check_backup.py, docs/backup.md), before anything is installed: a new folder each time."""
        p = self.person
        p.step("Backing up what the TV says about itself")
        if self.tv_answer is None and not self.dry and self.tv:
            self.tv_answer = self.tv.description()  # needs no Developer Mode
        stamp = datetime.date.today().isoformat()
        try:
            folder, manifest = check_backup.write_backup(self.out_dir, stamp, TOOL_VERSION, self.tv_answer, self.app_list)
        except OSError as e:
            self.laptop["backup"] = "none"
            p.say(f"The backup couldn't be written: {e}")
            return
        self.backup_folder = folder
        got = manifest["captured"]
        self.laptop["backup"] = "saved" if all(got.values()) else ("partial" if any(got.values()) else "none")
        p.say(
            f"Saved in a new folder: {folder}",
            f"  The TV's description: {'saved' if got['tvInfo'] else 'NOT captured (the TV did not answer)'}",
            f"  The list of apps: {'saved, ' + str(manifest['appCount']) + ' apps' if got['apps'] else 'NOT captured'}",
            "RESTORE.txt in it says, in plain words, what is kept and how to go back.",
        )

    def finish_backup_only(self):
        p = self.person
        p.step("Done")
        if self.backup_folder:
            p.say(f"The backup is in {self.backup_folder}", "Nothing was installed and nothing on the TV changed.")
        else:
            p.say("No backup was made: the TV wasn't found.")
        if not self.dry and not self.args.no_pause:
            p.wait("Press Enter to close.")
        if self.laptop.get("backup") not in ("saved", "partial"):
            raise SystemExit(1)

    def certificate(self):
        """The TV's certificate (AeroTizen's certs step): kept in AeroTizen's folder for this TV."""
        p = self.person
        p.step("The TV's certificate (Samsung account sign-in)")
        from aerotizen import cli as aero_cli

        if self.args.cert_dir:
            self.cert_dir = Path(self.args.cert_dir)
        elif self.dry:
            self.cert_dir = Path(tempfile.mkdtemp(prefix="hometv-check-dry-certs-"))
            make_throwaway_certs(self.cert_dir)
            self.laptop["certs"] = "made"
            p.say("Dry run: a throwaway certificate, made here, stands in for Samsung's.")
            return True
        else:
            self.cert_dir = Path(aero_cli.cert_dir_for(self.duid))
        if all((self.cert_dir / f).is_file() for f in CERT_FILES) and (self.cert_dir / "device-profile.xml").is_file():
            self.laptop["certs"] = "existing"
            p.say("This laptop already has this TV's certificate. No sign-in needed.")
            return True
        p.say(
            "Samsung TVs only take apps signed with a certificate for that one TV. To make it, your web browser",
            "opens Samsung's sign-in page: sign in with your Samsung account (or make a free one there).",
            "When it says 'Signed in. You can close this tab.', come back here.",
            "The certificate files stay on this laptop. At the end this tool says where they are.",
        )
        p.wait("Press Enter to open the sign-in page.")
        from aerotizen import certs

        try:
            certs.create_profile(self.duid, str(self.cert_dir))
        except SystemExit as e:
            self.laptop["certs"] = "failed"
            p.say(f"The sign-in didn't finish: {e}", "Start the tool again to try once more.")
            return False
        except Exception as e:  # network trouble, Samsung's server
            self.laptop["certs"] = "failed"
            p.say(f"Making the certificate failed: {e}")
            return False
        self.laptop["certs"] = "made"
        p.say("Done: the certificate is made.")
        return True

    def install_and_start(self):
        p = self.person
        p.step("Installing the check app on the TV")
        wgt = Path(self.args.wgt) if self.args.wgt else next((w for w in WGT_PLACES if w.is_file()), None)
        if not wgt or not wgt.is_file():
            p.say("The check app (HomeTV-Check-App.wgt) is missing from this folder. Download the tool again.")
            self.laptop["install"] = "failed"
            return False
        p.say("The TV shows nothing yet; this takes up to a minute.")
        from aerotizen import signer

        with tempfile.TemporaryDirectory(prefix="hometv-check-") as tmp:
            signed = Path(tmp) / "HmTvCheck0-signed.wgt"
            try:
                signer.sign_wgt(str(wgt), str(signed), str(self.cert_dir))
            except Exception as e:
                self.laptop["install"] = "failed"
                p.say(f"Signing the check app failed: {e}")
                return False
            if self.dry:
                p.say(f"Dry run: signed {wgt.name} ({signed.stat().st_size} bytes) with the throwaway certificate; not installed.")
                self.laptop["install"] = "ok"
                self.laptop["start"] = "ok"
                return True
            # From here the app may be on the TV, even if the install reports a failure or is interrupted: the
            # clean-up always tries to remove it (removing an app that isn't there does no harm).
            self.installed = True
            try:
                with self.tv.session(timeout=60) as s:
                    self._install(s, signed)
            except (Exception, SystemExit) as e:
                self.laptop["install"] = "failed"
                p.say(f"Installing failed: {e}")
                return False
        self.laptop["install"] = "ok"
        p.say("Installed: 'HomeTV Check' is on the TV.")
        return self.start_app()

    def _install(self, s, signed):
        from aerotizen import cli as aero_cli

        tool_path = s.capability().get("sdk_toolpath", "/home/owner/share/tmp/sdk_tools")
        with open(self.cert_dir / "device-profile.xml", "rb") as f:
            s.push(f.read(), f"{tool_path}/device-profile.xml")
        output = s.install(APP_ID, signed.read_bytes(), tool_path)
        app_id, version = aero_cli.app_metadata_of(str(signed))
        aero_cli.verify_install(app_id, version, output, s.applist())

    def start_app(self):
        p = self.person
        from aerotizen import remote

        try:
            with self.tv.session() as s:
                s.launch(APP_ID)
        except Exception:
            remote.rest_launch(self.tv.host, APP_ID)
        deadline = time.monotonic() + 20
        status = None
        while time.monotonic() < deadline:
            status = remote.app_status(self.tv.host, APP_ID)
            if status and status.get("visible"):
                break
            time.sleep(1)
        # The emulator and some TVs don't describe app state; the person sees the screen.
        self.laptop["start"] = "ok" if (status is None or status.get("running") or status.get("visible")) else "failed"
        if self.laptop["start"] == "failed":
            p.say("The check app didn't come up on the TV. Open it yourself: Home, Apps, 'HomeTV Check'.")
            self.laptop["start"] = "ok" if p.ask_yes("Is 'HomeTV Check' on the TV's screen now?") else "failed"
        return self.laptop["start"] == "ok"

    def service_checks_from_laptop(self):
        """Do HomeTV's background helpers answer on their ports? Asked from the laptop, through Developer Mode."""
        if self.dry:
            self.laptop["watcherFromLaptop"] = "answers"
            self.laptop["pagesFromLaptop"] = "silent"
            return
        time.sleep(10)  # the check page starts them as it opens
        with contextlib.suppress(Exception):
            with self.tv.session() as s:
                w, _ = self.tv.http_get(s, WATCHER_PORT, "/state")
                g, _ = self.tv.http_get(s, PAGES_PORT, "/ping")
            self.laptop["watcherFromLaptop"] = "answers" if 200 <= w < 300 else "silent"
            self.laptop["pagesFromLaptop"] = "answers" if 200 <= g < 300 else "silent"

    def read_watcher(self):
        """Way 1 (docs/check-tool.md): the report the check page left with AeroTizen's watcher (its start-up trace slot)."""
        if self.dry:
            return dry_tv_report()
        try:
            with self.tv.session() as s:
                status, body = self.tv.http_get(s, WATCHER_PORT, "/state")
        except Exception:
            return None
        if not 200 <= status < 300:
            return None
        try:
            report = json.loads(body.decode("utf-8", "replace")).get("startup", {}).get("hometvCheck")
        except (ValueError, AttributeError):
            return None
        return report if isinstance(report, dict) else None

    def wait_for_tv(self):
        p = self.person
        p.step("Follow the TV's screen")
        p.say(
            "The TV now shows 'HomeTV Check'. Do what it asks, using the TV's remote. It takes about 20 minutes:",
            " - it checks a few things by itself (up to a minute; don't press anything),",
            " - asks you to press some remote buttons,",
            " - asks if a phone can open a page (optional),",
            " - opens YouTube and asks you to come back, and tries the Home button,",
            " - tries to open a film or video directly in a few apps, and asks what opened.",
            "If the TV ever shows another screen, open 'HomeTV Check' from Apps to carry on.",
            "When the TV says 'All done', come back here. This window notices by itself, or press Enter here.",
        )
        last_step = None
        deadline = time.monotonic() + self.args.wait_minutes * 60
        while time.monotonic() < deadline:
            report = self.read_watcher()
            if report:
                self.tv_report = report
                step = report.get("step")
                if step != last_step:
                    p.say(f"(The TV is on: {STEP_NAMES.get(step, step)}.)")
                    last_step = step
                if report.get("finished"):
                    self.laptop["reportRoute"] = "watcher"
                    p.say("The TV says it's done.")
                    return
            for _ in range(10):
                if p.stopped_waiting():
                    return
                time.sleep(1)
            if self.dry:
                return
        p.say("Stopped waiting.")

    def fetch_report(self):
        p = self.person
        p.step("Reading the TV's results")
        if self.laptop.get("reportRoute") == "watcher" and self.tv_report.get("finished"):
            p.say("Already read from the TV.")
            return
        if self.dry:
            self.tv_report = dry_tv_report()
            self.laptop["reportRoute"] = "watcher"
            return
        p.say("Reading them through the TV's web inspector: the check app restarts once on the TV. That's fine.")
        report = read_through_inspector(self.tv, self.args.inspector_port)
        if report:
            self.tv_report = report
            self.laptop["reportRoute"] = "inspector"
            p.say("Read.")
            return
        report = self.read_watcher()
        if report:
            self.tv_report = report
            self.laptop["reportRoute"] = "watcher"
            p.say("Read (part of them, if the TV wasn't finished).")
            return
        self.laptop["reportRoute"] = "none"
        p.say(
            "The laptop couldn't read the TV's results. Please take a photo of the TV's 'All done' screen with your",
            "phone (it lists the results) and send it with the report file. If the TV shows another screen, open",
            "'HomeTV Check' from Apps first: it goes back to the results.",
        )
        p.wait("Press Enter once you've taken the photo.")

    def remove_check_app(self):
        p = self.person
        if self.dry:
            p.step("Removing the check app")
            self.laptop["uninstall"] = "ok"
            p.say("Dry run: nothing to remove.")
            return
        if not self.installed or self.args.keep_app:
            return
        p.step("Removing the check app")
        try:
            with self.tv.session() as s:
                s.uninstall(APP_ID)
                gone = APP_ID not in app_ids(s.applist())
        except Exception:
            gone = False
        self.laptop["uninstall"] = "ok" if gone else "failed"
        self.installed = not gone
        p.say(
            "Removed: 'HomeTV Check' is gone from the TV, with its settings."
            if gone
            else "The check app is still on the TV. Remove it there: Home, Apps, the gear (Settings), "
            "HomeTV Check, Delete."
        )

    def finish(self):
        p = self.person
        p.step("The report")
        report = check_report.clean_report(self.laptop, self.tv_report)
        stamp = datetime.date.today().isoformat()
        txt, js = check_report.write_report(report, self.out_dir, stamp)
        p.say(
            "Two files are on your Desktop:" if not self.dry and not self.args.out else "Two files:",
            f"   {txt}",
            f"   {js}",
            "",
            "PLEASE SEND BOTH FILES to the person who sent you the link (attach them to an email or a message).",
            "They hold only what the instructions page lists: no names, addresses, serial numbers or accounts.",
        )
        if self.backup_folder:
            p.say(
                "",
                "The TV's backup, from before the check, is in this folder (keep it; you don't need to send it):",
                f"   {self.backup_folder}",
            )
        if self.cert_dir and self.laptop.get("certs") in ("made", "existing") and not self.dry:
            p.say(
                "",
                "KEEP THE TV'S 3 CERTIFICATE FILES. HomeTV's later updates must be signed with them. They are in:",
                f"   {self.cert_dir}",
                "   " + ", ".join(CERT_FILES),
                "Copy them to a USB stick, or send them to the person who sent you the link.",
                "Treat them like a password: don't post them anywhere or share them with anyone else.",
            )
            if not self.args.no_open:
                with contextlib.suppress(Exception):
                    os.startfile(str(self.cert_dir))  # opens the folder in Explorer
        p.say(
            "",
            "Please switch Developer Mode off now: while it's on, it lets the laptop at 'Host PC IP' into the TV.",
            "On the TV: Apps, press 1 2 3 4 5, switch Developer mode Off, press OK, then restart the TV fully",
            "(hold the power button about 5 seconds). Installing HomeTV later switches it on again the same way.",
        )
        links = (self.tv_report or {}).get("links", {})
        if isinstance(links, dict) and isinstance(links.get("netflixRemote"), dict) and links["netflixRemote"].get("sent") == "yes":
            p.say(
                "",
                "If the TV asked you to allow 'HomeTV', remove it again: Settings > General > External Device",
                "Manager > Device Connection Manager > Device List > HomeTV > Delete.",
            )
        if self.dry and self.cert_dir:
            shutil.rmtree(self.cert_dir, ignore_errors=True)
        p.say("", "Thank you! You can close this window.")
        if not self.dry and not self.args.no_pause:
            p.wait("Press Enter to close.")


STEP_NAMES = {
    "auto": "checking by itself",
    "keys": "remote buttons",
    "phone": "the phone",
    "youtube": "YouTube and back",
    "home": "the Home button",
    "links": "opening a film or video",
    "done": "all done",
}


def read_through_inspector(tv, local_port):
    """Way 2 (docs/check-tool.md): restart the check app with its web inspector (AeroTizen's `inspect`) and ask the
    page for its report (Chrome DevTools: Runtime.evaluate of HomeTVCheck.report()). The results survive the restart:
    the page keeps them in its own storage.

    AeroTizen's forwarder blocks for good while it holds the TV's one Developer Mode connection, so it runs in a child
    process (this file, --inspector-child) that is ended afterwards: that frees the connection, its lock and the port."""
    import queue
    import subprocess

    from aerotizen.cdp import Page

    cmd = [sys.executable, str(Path(__file__).resolve()), "--inspector-child", "--host", tv.host,
           "--sdb-port", str(tv.sdb_port), "--inspector-port", str(local_port)]
    child = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    lines = queue.Queue()
    threading.Thread(target=lambda: [lines.put(line) for line in child.stdout], daemon=True).start()
    try:
        deadline = time.monotonic() + 45
        ready = False
        while time.monotonic() < deadline and not ready and child.poll() is None:
            with contextlib.suppress(queue.Empty):
                ready = lines.get(timeout=0.5).startswith("ready")
        if not ready:
            return None
        while time.monotonic() < deadline and child.poll() is None:
            try:
                text = Page(local_port).eval("window.HomeTVCheck ? window.HomeTVCheck.report() : ''")
                if text:
                    report = json.loads(text)
                    return report if isinstance(report, dict) else None
            except Exception:
                pass
            time.sleep(2)
        return None
    finally:
        child.terminate()
        with contextlib.suppress(Exception):
            child.wait(10)


def inspector_child(host, sdb_port, local_port):
    """The child process of read_through_inspector: AeroTizen's `inspect` steps, with this tool's ports. Prints
    'ready <port>' once the inspector is forwarded to localhost:<local_port>, then forwards until it is ended."""
    from aerotizen import inspect_app

    with Tv(host, sdb_port).session(timeout=60) as s:
        port = None
        for _ in range(4):
            inspect_app.stop(host, APP_ID)
            try:
                port = s.debug_launch(APP_ID)
                break
            except Exception:
                time.sleep(0.5)
        if port is None:
            print("failed", flush=True)
            return 1
        print(f"ready {port}", flush=True)
        s.forward(local_port, port)
    return 0


def dry_tv_answer():
    """A made-up /api/v2/ answer, with the identifiers a real one carries (dry run only: the backup drops them)."""
    return {
        "device": {
            "type": "Samsung SmartTV", "OS": "Tizen", "model": "20_MUSEL_UHD", "modelName": "UE43TU7000",
            "firmwareVersion": "Unknown", "resolution": "3840x2160", "networkType": "wireless", "developerMode": "1",
            "PowerState": "on", "TokenAuthSupport": "true", "VoiceSupport": "true",
            "name": "dry-run-dropped", "duid": "uuid:00000000-0000-0000-0000-000000000000", "id": "dry-run-dropped",
            "wifiMac": "00:00:5E:00:53:01", "ip": "192.168.1.50", "ssid": "dry-run-dropped", "developerIP": "192.168.1.23",
        },
        "id": "uuid:00000000-0000-0000-0000-000000000000", "name": "dry-run-dropped", "version": "2.0.25",
        "uri": "http://192.168.1.50:8001/api/v2/",
    }


def dry_tv_report():
    """A made-up TV report, as the check page would leave it (dry run only)."""
    return {
        "schema": "hometv-check-1", "checkApp": "1.0.0", "finished": True, "step": "done",
        "tv": {"model": "UE43TU7000", "osVersion": "5.5", "chromium": 69, "screen": "1920x1080"},
        "timing": {"startMs": 1800},
        "apps": {"listed": True, "count": 40, "known": {"youtube": True, "netflix": True, "prime": False}},
        "services": {"watcher": "answers", "watcherMs": 2100, "pages": "silent"},
        "keys": {"red": "yes", "green": "yes", "yellow": "yes", "blue": "yes", "info": "no", "digits": "no-buttons"},
        "phone": "no-phone",
        "youtube": {"opened": "yes", "back": "running", "answer": "back-key"},
        "home": {"app": "youtube", "opened": "yes", "back": "running", "seconds": 6, "answer": "by-itself"},
        "links": {
            "youtubeAppControl": {"sent": "yes", "answer": "title"},
            "netflixAppControl": {"sent": "yes", "answer": "app"},
            "netflixRemote": {"sent": "no", "error": "NotFoundError", "answer": "nothing"},
            "primeAppControl": {"sent": "not-on-tv"},
            "youtubeDial": {"sent": "yes", "answer": "skipped"},
        },
        # Never in a report: the allowlist drops these.
        "serial": "dry-run-dropped", "ip": "192.168.1.50",
    }


def make_throwaway_certs(folder):
    """Dry run only: a self-signed author and distributor pair in AeroTizen's layout, to try the signing step."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives.serialization import pkcs12
    from cryptography.x509.oid import NameOID

    password = "dry-run"
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "hometv-check-dry-run")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
        .serial_number(x509.random_serial_number()).not_valid_before(now)
        .not_valid_after(now + datetime.timedelta(days=1)).sign(key, hashes.SHA256())
    )
    enc = serialization.BestAvailableEncryption(password.encode())
    for n in ("author", "distributor"):
        (folder / f"{n}.p12").write_bytes(pkcs12.serialize_key_and_certificates(n.encode(), key, cert, None, enc))
    (folder / "password.txt").write_text(password)
    (folder / "device-profile.xml").write_text("<profile/>")


def main(argv=None):
    parser = argparse.ArgumentParser(prog="hometv_check", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="walk through every step with made-up answers; no TV, no network")
    parser.add_argument("--backup-only", action="store_true", help="only back up what the TV says about itself and its apps; install nothing")
    parser.add_argument("--host", "--target", "--tv", dest="host", help="the TV's (or emulator's) address; skips the search")
    parser.add_argument("--sdb-port", type=int, default=None, help="Developer Mode port (default 26101)")
    parser.add_argument("--cert-dir", help="a folder with author.p12, distributor.p12, password.txt, device-profile.xml (skips the sign-in)")
    parser.add_argument("--wgt", help="the unsigned check app (default: HomeTV-Check-App.wgt next to this tool)")
    parser.add_argument("--out", help="where to write the report (default: the Desktop)")
    parser.add_argument("--wait-minutes", type=float, default=45, help="how long to wait for the TV (default 45)")
    parser.add_argument("--inspector-port", type=int, default=9222, help="local port for the web inspector (default 9222)")
    parser.add_argument("--keep-app", action="store_true", help="leave the check app on the TV (testing only)")
    parser.add_argument("--no-open", action="store_true", help="don't open the certificate folder in Explorer")
    parser.add_argument("--no-pause", action="store_true", help="don't wait for Enter at the very end")
    parser.add_argument("--inspector-child", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    if args.inspector_child:
        sys.exit(inspector_child(args.host, args.sdb_port, args.inspector_port))
    Check(args).run()


if __name__ == "__main__":
    main()
