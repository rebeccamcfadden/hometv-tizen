// HomeTV's loader: the first script of the installed app's dist/index.html. Plain ES5, no network, no crypto, so it
// runs as is on 2018 TVs. It shows the newest complete, trusted page the TV has:
// - a page the updater downloaded and checked (in the app's private storage, wgt-private/pages/<version>/), read
//   through tizen.filesystem and injected inline, so the app never navigates to a file:// page; or
// - the page that came inside the app (dist/), when there is none, it fails, or the TV can't run it.
// The page calls HomeTVBoot.started() once Home shows. A downloaded page that doesn't is dropped: the next start
// (or a reload after START_TIMEOUT_MS) goes back to the previous good page. docs/page-updates.md explains it.
(function (win) {
  "use strict";

  var doc = win.document;
  var SHELL = win.HOMETV_SHELL || {};
  var STATE_KEY = "hometv.pages";
  var DIR = "pages";
  var START_TIMEOUT_MS = SHELL.startTimeoutMs || 30000;
  var UPDATE_DELAY_MS = SHELL.updateDelayMs == null ? 10000 : SHELL.updateDelayMs;
  var CHECK_EVERY_MS = (SHELL.checkHours || 12) * 3600000;
  var SKIP_KEEP = 20;
  var BUNDLED = SHELL.page || { version: "0.0.0", entry: { css: [], js: [], body: "" } };

  // Where the installed page lives (absolute), captured before a downloaded page sets <base>.
  var shellBase = String(win.location.href).replace(/[?#].*$/, "").replace(/[^\/]*$/, "");

  // The keys and the update address belong to the installed app: copied here once, before any page code runs.
  var shell = {
    version: String(SHELL.shellVersion || "0.0.0"),
    pageVersion: String(BUNDLED.version),
    updateUrl: String(SHELL.updateUrl || ""),
    keys: (SHELL.keys || []).slice(0),
    maxPages: 2,
  };
  if (Object.freeze) {
    Object.freeze(shell.keys);
    Object.freeze(shell);
  }

  // ---- versions: x.y.z, numbers only ----

  function parseVersion(v) {
    var m = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(String(v));
    return m ? [+m[1], +m[2], +m[3]] : null;
  }

  /** -1, 0 or 1; null when either isn't a version. */
  function compareVersions(a, b) {
    var x = parseVersion(a);
    var y = parseVersion(b);
    if (!x || !y) {
      return null;
    }
    for (var i = 0; i < 3; i++) {
      if (x[i] !== y[i]) {
        return x[i] < y[i] ? -1 : 1;
      }
    }
    return 0;
  }

  // ---- state, in localStorage ----

  var storage = null;
  try {
    storage = win.localStorage;
    storage.setItem("hometv.probe", "1");
    storage.removeItem("hometv.probe");
  } catch (e) {
    storage = null;
  }

  function isObject(x) {
    return !!x && typeof x === "object" && Object.prototype.toString.call(x) !== "[object Array]";
  }

  function loadState() {
    var s = null;
    try {
      s = JSON.parse((storage && storage.getItem(STATE_KEY)) || "null");
    } catch (e) {
      s = null;
    }
    if (!isObject(s)) {
      s = {};
    }
    if (!isObject(s.pages)) {
      s.pages = {};
    }
    if (!isObject(s.fails)) {
      s.fails = {};
    }
    if (Object.prototype.toString.call(s.skip) !== "[object Array]") {
      s.skip = [];
    }
    var names = ["next", "good", "prev", "trying", "partial", "inlineBlocked"];
    for (var i = 0; i < names.length; i++) {
      if (typeof s[names[i]] !== "string") {
        s[names[i]] = null;
      }
    }
    return s;
  }

  function saveState(s) {
    try {
      if (storage) {
        storage.setItem(STATE_KEY, JSON.stringify(s));
      }
    } catch (e) {
      // A full or missing store: the bundled page still works.
    }
  }

  function skipVersion(s, v) {
    if (s.skip.indexOf(v) < 0) {
      s.skip.push(v);
    }
    while (s.skip.length > SKIP_KEEP) {
      s.skip.shift();
    }
    if (s.next === v) {
      s.next = null;
    }
    if (s.good === v) {
      s.good = s.prev;
      s.prev = null;
    }
    if (s.prev === v) {
      s.prev = null;
    }
  }

  /** A start of page v didn't reach started(): a new page is skipped at once, a once-good one after two. */
  function failedStart(s, v) {
    s.fails[v] = (s.fails[v] || 0) + 1;
    if (v !== s.good || s.fails[v] >= 2) {
      skipVersion(s, v);
    }
    s.trying = null;
  }

  function usable(s, v) {
    var p = v && s.pages[v];
    return !!(
      p &&
      p.entry &&
      p.files &&
      s.skip.indexOf(v) < 0 &&
      compareVersions(v, shell.pageVersion) === 1 &&
      compareVersions(p.minShell, shell.version) !== null &&
      compareVersions(p.minShell, shell.version) <= 0
    );
  }

  function pick(s) {
    if (s.inlineBlocked === shell.version) {
      return null;
    }
    var order = [s.next, s.good, s.prev];
    for (var i = 0; i < order.length; i++) {
      if (usable(s, order[i])) {
        return order[i];
      }
    }
    return null;
  }

  // ---- bytes and text ----

  /** A Uint8Array of this window's own kind (TweetNaCl checks instanceof). */
  function toBytes(data) {
    return data instanceof Uint8Array ? data : new Uint8Array(data);
  }

  function binaryString(bytes) {
    var parts = [];
    for (var i = 0; i < bytes.length; i += 0x8000) {
      parts.push(String.fromCharCode.apply(null, Array.prototype.slice.call(bytes.subarray(i, i + 0x8000))));
    }
    return parts.join("");
  }

  function bytesToBase64(bytes) {
    return win.btoa(binaryString(bytes));
  }

  function base64ToBytes(b64) {
    var bin = win.atob(b64 || "");
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  }

  function utf8(bytes) {
    if (win.TextDecoder) {
      return new win.TextDecoder("utf-8").decode(bytes);
    }
    return decodeURIComponent(escape(binaryString(bytes)));
  }

  // ---- the app's private storage, through either of Tizen's filesystem APIs ----
  // Paths are relative to wgt-private, with "/" between parts. Each call ends in cb(error, result).

  var ROOT = "wgt-private";

  function dirname(p) {
    var i = p.lastIndexOf("/");
    return i < 0 ? "" : p.slice(0, i);
  }

  function closeQuietly(h) {
    try {
      if (h) {
        h.close();
      }
    } catch (e) {
      // already closed
    }
  }

  /** Tizen 5.0 and newer: openFile and FileHandle. */
  function newFs(f) {
    function full(p) {
      return p ? ROOT + "/" + p : ROOT;
    }
    return {
      api: "openFile",
      read: function (p, cb) {
        var h = null;
        var data;
        try {
          h = f.openFile(full(p), "r");
          data = h.readData();
          h.close();
        } catch (e) {
          closeQuietly(h);
          return cb(e);
        }
        cb(null, toBytes(data));
      },
      write: function (p, bytes, cb) {
        function go() {
          var h = null;
          try {
            h = f.openFile(full(p), "w");
            h.writeData(toBytes(bytes));
            h.close();
          } catch (e) {
            closeQuietly(h);
            return cb(e);
          }
          cb(null);
        }
        var dir = full(dirname(p));
        try {
          if (f.pathExists(dir)) {
            return go();
          }
          f.createDirectory(dir, true, function () {
            go();
          }, function (e) {
            cb(e || new Error("createDirectory failed"));
          });
        } catch (e) {
          cb(e);
        }
      },
      removeDir: function (p, cb) {
        try {
          if (!f.pathExists(full(p))) {
            return cb(null);
          }
          f.deleteDirectory(full(p), true, function () {
            cb(null);
          }, function (e) {
            cb(e || new Error("deleteDirectory failed"));
          });
        } catch (e) {
          cb(e);
        }
      },
      uri: function (p, cb) {
        var u;
        try {
          u = f.toURI(full(p));
        } catch (e) {
          return cb(e);
        }
        cb(null, u);
      },
    };
  }

  /** Tizen 3 and 4 (still there, deprecated, on later TVs): resolve, File and FileStream. */
  function oldFs(f) {
    var root = null;
    function getRoot(cb) {
      if (root) {
        return cb(null, root);
      }
      try {
        f.resolve(ROOT, function (d) {
          root = d;
          cb(null, d);
        }, function (e) {
          cb(e || new Error("resolve failed"));
        }, "rw");
      } catch (e) {
        cb(e);
      }
    }
    function find(dir, rel) {
      try {
        return rel ? dir.resolve(rel) : dir;
      } catch (e) {
        return null;
      }
    }
    return {
      api: "resolve",
      read: function (p, cb) {
        getRoot(function (err, dir) {
          if (err) {
            return cb(err);
          }
          var file = find(dir, p);
          if (!file || file.isDirectory) {
            return cb(new Error("NotFoundError: " + p));
          }
          try {
            file.openStream("r", function (s) {
              var b64;
              try {
                b64 = file.fileSize ? s.readBase64(file.fileSize) : "";
                s.close();
              } catch (e) {
                closeQuietly(s);
                return cb(e);
              }
              cb(null, base64ToBytes(b64));
            }, function (e) {
              cb(e || new Error("openStream failed"));
            });
          } catch (e) {
            cb(e);
          }
        });
      },
      write: function (p, bytes, cb) {
        getRoot(function (err, dir) {
          if (err) {
            return cb(err);
          }
          var parts = p.split("/");
          var name = parts.pop();
          var file;
          try {
            for (var i = 0; i < parts.length; i++) {
              dir = find(dir, parts[i]) || dir.createDirectory(parts[i]);
            }
            file = find(dir, name) || dir.createFile(name);
            file.openStream("w", function (s) {
              try {
                s.writeBase64(bytesToBase64(toBytes(bytes)));
                s.close();
              } catch (e) {
                closeQuietly(s);
                return cb(e);
              }
              cb(null);
            }, function (e) {
              cb(e || new Error("openStream failed"));
            });
          } catch (e) {
            cb(e);
          }
        });
      },
      removeDir: function (p, cb) {
        getRoot(function (err, dir) {
          if (err) {
            return cb(err);
          }
          var target = find(dir, p);
          if (!target) {
            return cb(null);
          }
          var parent = find(dir, dirname(p));
          try {
            parent.deleteDirectory(target.fullPath, true, function () {
              cb(null);
            }, function (e) {
              cb(e || new Error("deleteDirectory failed"));
            });
          } catch (e) {
            cb(e);
          }
        });
      },
      uri: function (p, cb) {
        getRoot(function (err, dir) {
          if (err) {
            return cb(err);
          }
          var target = find(dir, p);
          if (!target) {
            return cb(new Error("NotFoundError: " + p));
          }
          var u;
          try {
            u = target.toURI();
          } catch (e) {
            return cb(e);
          }
          cb(null, u);
        });
      },
    };
  }

  function makeFs() {
    var f = null;
    try {
      f = win.tizen && win.tizen.filesystem;
    } catch (e) {
      f = null;
    }
    if (!f) {
      return null;
    }
    if (typeof f.openFile === "function") {
      return newFs(f);
    }
    if (typeof f.resolve === "function") {
      return oldFs(f);
    }
    return null;
  }

  var fs = makeFs();

  // ---- showing a page ----

  function whenReady(fn) {
    if (doc.readyState === "loading") {
      doc.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function el(tag, props) {
    var e = doc.createElement(tag);
    for (var k in props) {
      e[k] = props[k];
    }
    return e;
  }

  /** Relative url(...) in a downloaded CSS file, pointed at the file's own folder (an inline style resolves from <base>). */
  function rebaseCss(css, file) {
    var dir = dirname(file);
    if (!dir) {
      return css;
    }
    return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, function (all, q, url) {
      if (/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(url)) {
        return all;
      }
      return "url(" + q + dir + "/" + url.replace(/^\.\//, "") + q + ")";
    });
  }

  function showBundled() {
    var entry = BUNDLED.entry;
    whenReady(function () {
      doc.body.innerHTML = entry.body || "";
      var waiting = entry.css.length;
      var scriptsAdded = false;
      function addScripts() {
        if (scriptsAdded) {
          return;
        }
        scriptsAdded = true;
        for (var j = 0; j < entry.js.length; j++) {
          doc.head.appendChild(el("script", { src: shellBase + entry.js[j], async: false }));
        }
      }
      function oneLoaded() {
        waiting--;
        if (waiting <= 0) {
          addScripts();
        }
      }
      // Styles first, as the page's own <link> tags would block its scripts.
      for (var i = 0; i < entry.css.length; i++) {
        var link = el("link", { rel: "stylesheet", href: shellBase + entry.css[i] });
        link.onload = oneLoaded;
        link.onerror = oneLoaded;
        doc.head.appendChild(link);
      }
      if (!waiting) {
        addScripts();
      } else {
        win.setTimeout(addScripts, 3000);
      }
    });
  }

  /** Reads a downloaded page's CSS and JS, each checked against the size recorded when the updater verified it. */
  function readPage(v, page, cb) {
    var sizes = {};
    for (var i = 0; i < page.files.length; i++) {
      sizes[page.files[i].path] = page.files[i].size;
    }
    var names = page.entry.css.concat(page.entry.js);
    var texts = {};
    var n = 0;
    function nextFile() {
      if (n === names.length) {
        return fs.uri(DIR + "/" + v, function (err, uri) {
          cb(err, texts, uri);
        });
      }
      var name = names[n++];
      fs.read(DIR + "/" + v + "/" + name, function (err, bytes) {
        if (err) {
          return cb(err);
        }
        if (bytes.length !== sizes[name]) {
          return cb(new Error(name + " is " + bytes.length + " bytes, expected " + sizes[name]));
        }
        try {
          texts[name] = utf8(bytes);
        } catch (e) {
          return cb(e);
        }
        nextFile();
      });
    }
    nextFile();
  }

  /** True when the TV runs inline scripts (a strict content security policy would stop them). */
  function inlineRuns() {
    win.__hometvInline = false;
    doc.head.appendChild(el("script", { text: "window.__hometvInline = true;" }));
    var ok = win.__hometvInline === true;
    win.__hometvInline = undefined;
    return ok;
  }

  function injectDownloaded(page, texts, uri) {
    var entry = page.entry;
    var head = doc.head;
    head.insertBefore(el("base", { href: uri.replace(/\/?$/, "/") }), head.firstChild);
    doc.body.innerHTML = entry.body || "";
    var i;
    for (i = 0; i < entry.css.length; i++) {
      head.appendChild(el("style", { textContent: rebaseCss(texts[entry.css[i]], entry.css[i]) }));
    }
    for (i = 0; i < entry.js.length; i++) {
      head.appendChild(el("script", { text: texts[entry.js[i]] + "\n//# sourceURL=" + entry.js[i] }));
    }
    if (doc.readyState === "complete") {
      // The window's load event has passed: the page's own load handlers (AeroTizen's) still get one.
      var e = doc.createEvent("Event");
      e.initEvent("load", false, false);
      win.dispatchEvent(e);
    }
  }

  // ---- the start ----

  var current = null; // the downloaded version shown, or null for the bundled page
  var startedDone = false;
  var startTimer = null;
  var info = { page: shell.pageVersion, source: "bundled", fs: fs ? fs.api : "none", note: "", lastCheck: null };

  function startWith(s) {
    var v = fs ? pick(s) : null;
    if (!v) {
      current = null;
      s.trying = null;
      saveState(s);
      showBundled();
      return;
    }
    s.trying = v;
    saveState(s);
    var page = s.pages[v];
    readPage(v, page, function (err, texts, uri) {
      if (err) {
        // Missing or damaged on the TV: skip it and show the next best page now.
        var s2 = loadState();
        skipVersion(s2, v);
        s2.trying = null;
        info.note = "page " + v + " unreadable: " + (err.message || err.name || err);
        return startWith(s2);
      }
      whenReady(function () {
        if (!inlineRuns()) {
          var s3 = loadState();
          s3.inlineBlocked = shell.version;
          s3.trying = null;
          info.note = "this TV doesn't run inline scripts, so downloaded pages are off";
          return startWith(s3);
        }
        current = v;
        info.page = v;
        info.source = "downloaded";
        startTimer = win.setTimeout(function () {
          if (startedDone) {
            return;
          }
          var s4 = loadState();
          if (s4.trying === v) {
            failedStart(s4, v);
            saveState(s4);
          }
          win.location.reload();
        }, START_TIMEOUT_MS);
        injectDownloaded(page, texts, uri);
      });
    });
  }

  function boot() {
    var s = loadState();
    if (s.trying) {
      // The last start of this page never reached Home.
      info.note = "page " + s.trying + " didn't start last time";
      failedStart(s, s.trying);
    }
    startWith(s);
  }

  // ---- after Home shows ----

  /** Keeps the page shown and the good, next or previous one (two at most); returns the versions to delete. */
  function tidy(s) {
    var keep = {};
    var order = [current, s.good, s.next, s.prev];
    var kept = 0;
    var v;
    for (var i = 0; i < order.length; i++) {
      v = order[i];
      if (v && s.pages[v] && !keep[v] && kept < shell.maxPages && (v === current || s.skip.indexOf(v) < 0)) {
        keep[v] = true;
        kept++;
      }
    }
    var drop = [];
    for (v in s.pages) {
      if (!keep[v]) {
        drop.push(v);
        delete s.pages[v];
      }
    }
    if (s.next && !keep[s.next]) {
      s.next = null;
    }
    if (s.prev && !keep[s.prev]) {
      s.prev = null;
    }
    if (s.good && !keep[s.good]) {
      s.good = null;
    }
    for (v in s.fails) {
      if (!keep[v]) {
        delete s.fails[v];
      }
    }
    if (s.partial && !keep[s.partial] && drop.indexOf(s.partial) < 0) {
      drop.push(s.partial);
    }
    s.partial = null;
    return drop;
  }

  function removeDirs(names, done) {
    if (!fs || !names.length) {
      return done && done();
    }
    var name = names.shift();
    fs.removeDir(name, function () {
      removeDirs(names, done);
    });
  }

  function started() {
    if (startedDone) {
      return;
    }
    startedDone = true;
    if (startTimer) {
      win.clearTimeout(startTimer);
    }
    var s = loadState();
    if (current && s.trying === current) {
      if (s.good !== current) {
        s.prev = s.good;
        s.good = current;
      }
      if (s.next === current) {
        s.next = null;
      }
      s.fails[current] = 0;
    }
    s.trying = null;
    var drop = tidy(s);
    var empty = true;
    for (var k in s.pages) {
      if (s.pages.hasOwnProperty(k)) {
        empty = false;
      }
    }
    saveState(s);
    var dirs = [];
    if (empty) {
      dirs.push(DIR);
    } else {
      for (var i = 0; i < drop.length; i++) {
        dirs.push(DIR + "/" + drop[i]);
      }
    }
    removeDirs(dirs);
    scheduleUpdates();
  }

  // ---- the updater (update.js), loaded only after Home shows ----

  var updating = false;

  function canUpdate() {
    return !!(shell.updateUrl && shell.keys.length && fs && storage && loadState().inlineBlocked !== shell.version);
  }

  function loadScript(name, cb) {
    var e = el("script", { src: shellBase + name, async: true });
    e.onload = function () {
      cb(null);
    };
    e.onerror = function () {
      cb(new Error(name + " didn't load"));
    };
    doc.head.appendChild(e);
  }

  var updaterApi = {
    shell: shell,
    fs: fs,
    dir: DIR,
    loadState: loadState,
    saveState: saveState,
    compareVersions: compareVersions,
    loadScript: loadScript,
    removeDirs: removeDirs,
    current: function () {
      return current;
    },
  };

  function checkNow(done) {
    if (updating || !canUpdate()) {
      return done && done(null, "off");
    }
    updating = true;
    function finish(err, result) {
      updating = false;
      info.lastCheck = { at: new Date().toISOString(), result: err ? "failed: " + (err.message || err) : result };
      if (done) {
        done(err, result);
      }
    }
    if (win.HomeTVUpdate && win.HomeTVUpdate.run) {
      return win.HomeTVUpdate.run(updaterApi, finish);
    }
    loadScript("update.js", function (err) {
      if (err || !win.HomeTVUpdate) {
        return finish(err || new Error("update.js didn't load"));
      }
      win.HomeTVUpdate.run(updaterApi, finish);
    });
  }

  function scheduleUpdates() {
    if (!canUpdate()) {
      return;
    }
    win.setTimeout(function again() {
      checkNow(function () {
        win.setTimeout(again, CHECK_EVERY_MS);
      });
    }, UPDATE_DELAY_MS);
  }

  win.HomeTVBoot = {
    started: started,
    checkNow: checkNow,
    status: function () {
      var s = loadState();
      return {
        page: info.page,
        source: info.source,
        shell: shell.version,
        bundled: shell.pageVersion,
        fs: info.fs,
        updates: canUpdate() ? shell.updateUrl : "off",
        good: s.good,
        next: s.next,
        skipped: s.skip.slice(0),
        note: info.note,
        lastCheck: info.lastCheck,
      };
    },
    compareVersions: compareVersions,
    parseVersion: parseVersion,
  };

  boot();
})(window);
