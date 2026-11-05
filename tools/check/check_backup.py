"""The TV's backup, on the laptop: what the TV says about itself and which apps it has, saved before anything is installed.

Saved into a new folder, HomeTV-Backup-<date> (then -2, -3, …), never into one that's there already, so the first
backup of a TV is never overwritten. The folder holds:

  tv-info.json   the TV's own description (GET http://<tv>:8001/api/v2/, or https on 8002), only the fields in
                 DEVICE_FIELDS: no name, serial, device id, address (IP or MAC) or Wi-Fi name
  apps.json      the installed apps (id, name, version), read over the Developer Mode connection (AeroTizen's applist)
  RESTORE.txt    in plain words: what is in the folder, what isn't, and how to go back
  backup.json    what was captured and what wasn't
  SHA256SUMS     the SHA-256 of each file above

A read that failed or came back empty is never saved as if it were the TV's state: its file is left out and the folder
says "not captured". Nothing is written to the TV: both reads only ask.
"""

import datetime
import hashlib
import json
import re
from pathlib import Path

import check_report

SCHEMA = "hometv-backup-1"
FOLDER_PREFIX = "HomeTV-Backup-"

# The TV's description (/api/v2/'s "device"), field by field: the same rules as the report (check_report). Anything
# else (name, id, duid, udn, wifiMac, ip, ssid, developerIP, countryCode, …) is dropped.
_FLAG = "enum:true|false"
DEVICE_FIELDS = {
    "type": "re:text",
    "OS": "re:word",
    "model": "re:model",
    "modelName": "re:model",
    "firmwareVersion": "re:model",
    "resolution": "re:screen",
    "networkType": "enum:wireless|wired",
    "developerMode": "enum:0|1",
    "PowerState": "enum:on|standby",
    "smartHubAgreement": _FLAG,
    "TokenAuthSupport": _FLAG,
    "VoiceSupport": _FLAG,
    "FrameTVSupport": _FLAG,
    "GamePadSupport": _FLAG,
    "ImeSyncedSupport": _FLAG,
}
TOP_FIELDS = {"version": "re:version", "remote": "re:version"}
# A short phrase, like "Samsung SmartTV": letters, digits and spaces only.
PATTERNS = {"text": re.compile(r"^[A-Za-z][A-Za-z0-9 ]{0,39}$")}
# Never in a backup, whatever the field: an IPv4 address, a MAC address, a UUID or a long run of hex (a device id).
IDENTIFYING = re.compile(
    r"(\b\d{1,3}(\.\d{1,3}){3}\b)|(\b[0-9A-Fa-f]{2}([:-][0-9A-Fa-f]{2}){5}\b)"
    r"|([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})|(\b[0-9A-Fa-f]{12,}\b)"
)
APP_ID = re.compile(r"^[A-Za-z0-9_.-]{1,80}$")
# Apps' ids are public store ids (often 12+ digits), so only addresses and UUIDs are refused there.
IDENTIFYING_IN_APP = re.compile(
    r"(\b\d{1,3}(\.\d{1,3}){3}\b)|(\b[0-9A-Fa-f]{2}([:-][0-9A-Fa-f]{2}){5}\b)"
    r"|([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})"
)


def _leaf(value, rule):
    kind, _, rest = rule.partition(":")
    if isinstance(value, bool):
        value = "true" if value else "false"
    if not isinstance(value, str) or IDENTIFYING.search(value):
        return None
    if kind == "re" and rest in PATTERNS:
        return value if PATTERNS[rest].fullmatch(value) else None
    return check_report.clean(value, rule)


def clean_tv_info(answer):
    """The TV's description with only the allowed fields, or None when nothing allowed is left (not a baseline)."""
    if not isinstance(answer, dict):
        return None
    device = answer.get("device") if isinstance(answer.get("device"), dict) else {}
    out = {k: v for k, v in ((k, _leaf(device[k], r)) for k, r in DEVICE_FIELDS.items() if k in device) if v is not None}
    if not out.get("model") and not out.get("modelName"):
        return None  # an answer without the model isn't the TV describing itself
    top = {k: v for k, v in ((k, _leaf(answer[k], r)) for k, r in TOP_FIELDS.items() if k in answer) if v is not None}
    return {"device": out, **top}


def clean_apps(apps):
    """The installed apps as [{id, name, version}], sorted by id, or None when the list is empty (never a baseline:
    every TV has apps, so an empty list is a failed read)."""
    out = {}
    for a in apps or []:
        if not isinstance(a, dict):
            continue
        app_id = a.get("appid")
        if not isinstance(app_id, str) or not APP_ID.fullmatch(app_id) or IDENTIFYING_IN_APP.search(app_id):
            continue
        name = a.get("name") if isinstance(a.get("name"), str) else app_id
        name = re.sub(r"[\x00-\x1f]", "", name).strip()[:80] or app_id
        if IDENTIFYING_IN_APP.search(name):
            name = app_id
        version = a.get("version") if isinstance(a.get("version"), str) and check_report.PATTERNS["version"].fullmatch(a["version"]) else None
        out[app_id] = {"id": app_id, "name": name, **({"version": version} if version else {})}
    return [out[k] for k in sorted(out)] or None


def new_folder(parent, stamp):
    """A new, empty backup folder: HomeTV-Backup-<stamp>, or -2, -3, … when that is taken. Never an existing one."""
    parent = Path(parent)
    parent.mkdir(parents=True, exist_ok=True)
    n = 1
    while True:
        folder = parent / (f"{FOLDER_PREFIX}{stamp}" if n == 1 else f"{FOLDER_PREFIX}{stamp}-{n}")
        try:
            folder.mkdir()  # fails if it exists: an earlier backup is never touched
            return folder
        except FileExistsError:
            n += 1


def _write(folder, name, text):
    path = folder / name
    with open(path, "x", encoding="utf-8", newline="\n") as f:  # "x": never over a file that's there
        f.write(text)
    return path


def restore_text(manifest, apps):
    """RESTORE.txt: plain words for the person."""
    got = manifest["captured"]
    info = manifest.get("tv") or {}
    tv_line = (
        f"  - The TV's description (tv-info.json): model {info.get('modelName') or info.get('model')}, "
        f"software {info.get('firmwareVersion', 'not given')}, screen {info.get('resolution', 'not given')}."
        if got["tvInfo"]
        else "  - The TV's description: NOT CAPTURED (the TV didn't answer on ports 8001 or 8002)."
    )
    apps_line = (
        f"  - The {len(apps)} apps installed on the TV (apps.json): their ids, names and versions."
        if got["apps"]
        else "  - The list of installed apps: NOT CAPTURED (it needs the Developer Mode connection, which didn't work)."
    )
    lines = [
        "HomeTV backup of a Samsung TV",
        f"Made on {manifest['date']} by HomeTV's check tool {manifest['tool']}, BEFORE anything was installed.",
        "",
        "WHAT IS IN THIS FOLDER",
        tv_line,
        apps_line,
        "  - SHA256SUMS: a fingerprint of each file, so you can tell later that nothing changed.",
        "  Nothing that identifies the TV or you: no name, serial number, device id, IP or MAC address, Wi-Fi name",
        "  or Samsung account.",
        "",
        "WHAT IS NOT IN IT (a Samsung TV doesn't let any app or tool read these)",
        "  - Picture and sound settings, the channel list, the Samsung account, Wi-Fi, accessibility and",
        "    power settings, the apps' own sign-ins and settings.",
        "  None of these are changed by HomeTV or by the check, so there is nothing of them to put back.",
        "  If you want a note of them anyway, photograph the TV's Settings screens with your phone.",
        "",
        "HOW TO GO BACK",
        "  1. Remove HomeTV, or the check app: on the TV, Home > Apps > the gear (Settings) > HomeTV (or",
        "     HomeTV Check) > Delete. The check tool removes the check app by itself at the end of a check.",
        "     This takes away the app with all its own settings; nothing else on the TV changes.",
        "  2. HomeTV's own settings (region, weather place, Home's row): in HomeTV, Settings > First run >",
        "     Restore previous settings puts back the ones from before the last change.",
        "  3. Developer Mode: Apps, press 1 2 3 4 5, switch it Off, OK, then restart the TV fully (hold the",
        "     power button about 5 seconds).",
        "  4. If the TV asked you to allow 'HomeTV': Settings > General > External Device Manager > Device",
        "     Connection Manager > Device List > HomeTV > Delete.",
        "  5. An app that went missing: compare the TV's Apps with apps.json and install it again from Samsung's",
        "     app store. (The check and HomeTV never remove other apps.)",
        "",
        "This folder stays with you. It isn't the check report: you don't need to send it to anyone.",
    ]
    if not got["tvInfo"] and not got["apps"]:
        lines[1:1] = ["", "INCOMPLETE: neither read worked, so this folder doesn't describe the TV. Run the backup again."]
    return "\n".join(lines) + "\n"


def write_backup(parent, stamp, tool_version, tv_answer, apps):
    """Writes a new backup folder under `parent`; returns (folder, manifest). `tv_answer` is /api/v2/'s JSON (or None),
    `apps` AeroTizen's parsed applist (or None). Failed or empty reads are marked "not captured", never saved."""
    info = clean_tv_info(tv_answer)
    app_list = clean_apps(apps)
    manifest = {
        "schema": SCHEMA,
        "tool": tool_version,
        "date": datetime.date.today().isoformat(),
        "captured": {"tvInfo": info is not None, "apps": app_list is not None},
        "tv": (info or {}).get("device"),
        "appCount": len(app_list) if app_list else None,
        "notCaptured": ["picture", "sound", "channels", "account", "network", "accessibility", "power", "app-data"],
    }
    folder = new_folder(parent, stamp)
    files = []
    if info is not None:
        files.append(_write(folder, "tv-info.json", json.dumps(info, indent=2, sort_keys=True) + "\n"))
    if app_list is not None:
        files.append(_write(folder, "apps.json", json.dumps(app_list, indent=2) + "\n"))
    files.append(_write(folder, "backup.json", json.dumps(manifest, indent=2, sort_keys=True) + "\n"))
    files.append(_write(folder, "RESTORE.txt", restore_text(manifest, app_list or [])))
    sums = "".join(f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n" for p in sorted(files))
    _write(folder, "SHA256SUMS", sums)
    return folder, manifest


def verify(folder):
    """True when every file SHA256SUMS lists is there with the same SHA-256."""
    folder = Path(folder)
    try:
        lines = (folder / "SHA256SUMS").read_text(encoding="utf-8").splitlines()
    except OSError:
        return False
    for line in lines:
        digest, _, name = line.partition("  ")
        p = folder / name
        if not name or "/" in name or "\\" in name or not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest() != digest:
            return False
    return bool(lines)
