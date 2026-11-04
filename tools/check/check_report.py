"""The check report's allowlist, on the laptop: only what report-schema.json lists leaves the tool.

The TV's check page cleans its part before it sends it (app/src/check/report.ts); this cleans it again, with the
laptop's own part, before anything is written to the report file. Same rules: bool; int:<min>:<max>;
enum:<a>|<b>; re:<pattern name>. Anything else (an app id, an address, a name, an error's text) is dropped.
"""

import json
import os
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCHEMA_PLACES = (
    HERE / "report-schema.json",  # the Windows bundle (tools/check/build-assets.mjs)
    HERE.parent.parent / "app" / "src" / "check" / "report-schema.json",  # the repo
)


def load_schema():
    for place in SCHEMA_PLACES:
        if place.is_file():
            with open(place, encoding="utf-8") as f:
                return json.load(f)
    raise FileNotFoundError("report-schema.json is missing")


SCHEMA = load_schema()
PATTERNS = {name: re.compile(p) for name, p in SCHEMA["patterns"].items()}
KNOWN_APPS = SCHEMA["knownApps"]


def _leaf(value, rule):
    kind, _, rest = rule.partition(":")
    if kind == "bool":
        return value if isinstance(value, bool) else None
    if kind == "int":
        low, high = (int(x) for x in rest.split(":"))
        ok = isinstance(value, int) and not isinstance(value, bool) and low <= value <= high
        return value if ok else None
    if kind == "enum":
        return value if isinstance(value, str) and value in rest.split("|") else None
    if kind == "re":
        pattern = PATTERNS.get(rest)
        return value if pattern and isinstance(value, str) and pattern.search(value) else None
    return None


def clean(value, spec):
    """A copy of `value` with only what `spec` allows (None when nothing is left)."""
    if isinstance(spec, str):
        return _leaf(value, spec)
    if not isinstance(value, dict):
        return None
    out = {}
    for key, sub in spec.items():
        if key in value:
            v = clean(value[key], sub)
            if v is not None:
                out[key] = v
    return out or None


def clean_report(laptop, tv):
    """The whole report: the laptop's part and the TV's, each allowlisted."""
    return {
        "about": "HomeTV check for Samsung TVs. Only the fields listed on the instructions page; no names, "
        "addresses, serial numbers, device ids, accounts or app lists.",
        "laptop": clean(laptop, SCHEMA["laptop"]) or {},
        "tv": clean(tv, SCHEMA["tv"]) or {},
    }


def known_from_app_ids(app_ids):
    """Which of the known streaming apps a list of the TV's app ids holds, by our keys."""
    ids = set(app_ids)
    return {key: any(i in ids for i in app["ids"]) for key, app in KNOWN_APPS.items()}


def _yes(known):
    names = [KNOWN_APPS[k]["name"] for k, v in (known or {}).items() if v]
    return ", ".join(names) or "none of the known ones"


def render_text(report):
    """The report as plain lines, for people. Built only from the cleaned report."""
    lap, tv = report.get("laptop", {}), report.get("tv", {})
    t = tv.get("tv", {})
    lt = lap.get("tv", {})
    lines = [
        "HomeTV check report (Samsung)",
        "Work in progress: the check itself is not tested on a real TV yet.",
        "",
        f"Date: {lap.get('date', '?')}   Took about {lap.get('minutes', '?')} minutes",
        f"Check tool {lap.get('tool', '?')}, check app {tv.get('checkApp', '?')}, "
        f"Windows {lap.get('windows', '?')}, Python {lap.get('python', '?')}, AeroTizen {lap.get('aerotizen', '?')}",
        "",
        "THE TV",
        f"  Model: {lt.get('modelName') or t.get('model') or '?'}  ({lt.get('model', '?')}, year {lt.get('year', '?')})",
        f"  Tizen: {t.get('tizen') or lt.get('platformVersion') or '?'}   Web engine: Chromium {t.get('chromium', '?')}"
        f"   Screen: {t.get('screen', '?')}",
        f"  Developer Mode: {lap.get('developerMode', '?')}, Host PC IP: {lap.get('hostPcIp', '?')}, "
        f"connection: {lap.get('sdb', '?')}",
        "",
        "APPS",
        f"  The laptop's list: {lap.get('apps', {}).get('count', '?')} apps; known: {_yes(lap.get('apps', {}).get('known'))}",
    ]
    apps = tv.get("apps", {})
    if apps:
        listed = apps.get("listed")
        lines.append(
            f"  The check app's list: {apps.get('count', '?')} apps; known: {_yes(apps.get('known'))}"
            if listed
            else "  The check app's list: the TV didn't list its apps"
        )
    s = tv.get("services", {})
    lines += [
        "",
        "INSTALL AND START",
        f"  Certificate: {lap.get('certs', '?')}   Install: {lap.get('install', '?')}   Start: {lap.get('start', '?')}"
        f"   Started in: {tv.get('timing', {}).get('startMs', '?')} ms",
        "",
        "BACKGROUND HELPERS (the big open question)",
        f"  Home watcher (port 47791): from the TV {s.get('watcher', '?')}"
        + (f" after {s['watcherMs']} ms" if "watcherMs" in s else "")
        + f"; from the laptop {lap.get('watcherFromLaptop', '?')}",
        f"  Pages service (port 8766): from the TV {s.get('pages', '?')}"
        + (f" after {s['pagesMs']} ms" if "pagesMs" in s else "")
        + f"; from the laptop {lap.get('pagesFromLaptop', '?')}",
        f"  A phone reached the TV: {tv.get('phone', '?')}",
        "",
        "REMOTE BUTTONS",
        "  " + (", ".join(f"{k} {v}" for k, v in tv.get("keys", {}).items()) or "?"),
        "",
        "OPENING AN APP AND COMING BACK",
    ]
    y = tv.get("youtube", {})
    lines.append(
        f"  YouTube: opened {y.get('opened', '?')}{' (' + y['error'] + ')' if 'error' in y else ''}; "
        f"page {y.get('back', '?')}; came back: {y.get('answer', '?')}"
    )
    hm = tv.get("home", {})
    lines.append(
        f"  Home button inside {hm.get('app', '?')}: opened {hm.get('opened', '?')}; page {hm.get('back', '?')}"
        f" after {hm.get('seconds', '?')} s; came back: {hm.get('answer', '?')}"
    )
    lines += ["", "OPENING A FILM OR VIDEO DIRECTLY"]
    for key, link in tv.get("links", {}).items():
        err = f" ({link['error']})" if "error" in link else ""
        lines.append(f"  {key}: sent {link.get('sent', '?')}{err}; what opened: {link.get('answer', '?')}")
    lines += [
        "",
        f"Check finished on the TV: {'yes' if tv.get('finished') else 'no'} (last step: {tv.get('step', '?')})",
        f"How the laptop got the TV's results: {lap.get('reportRoute', '?')}",
        f"Check app removed: {lap.get('uninstall', '?')}",
        "",
        "The same, for a computer, is in the .json file next to this one.",
    ]
    return "\n".join(lines) + "\n"


def write_report(report, folder, stamp):
    """Writes HomeTV-check-report-<stamp>.txt and .json into `folder`; returns both paths."""
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    base = folder / f"HomeTV-check-report-{stamp}"
    txt, js = base.with_suffix(".txt"), base.with_suffix(".json")
    n = 2
    while txt.exists() or js.exists():
        txt, js = Path(f"{base}-{n}.txt"), Path(f"{base}-{n}.json")
        n += 1
    js.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    txt.write_text(render_text(report), encoding="utf-8")
    return txt, js


if __name__ == "__main__":
    print(json.dumps(clean_report({}, {}), indent=2))
    print(os.linesep.join(sorted(SCHEMA["laptop"])))
