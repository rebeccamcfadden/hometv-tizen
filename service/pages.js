/*
 * HomeTV's pages service: the API keys page a phone opens from the TV's QR, served by HomeTV's own Samsung app.
 * A Tizen web service (tizen/config.xml, HmTvSpike0.HomeTVPages, packaged as pages/pages.js), started at power-on and
 * again by the TV's API keys screen; plain ES5 with
 * Node's built-in modules only, for the TV's Node (as old as 4.4.3). tools/check-legacy.mjs parses it as ES5.
 *
 * Ported from the Android launcher's KeyInbox.java, KeyRules.java and ApiKeys.java (hometv-launcher):
 *   GET  /keys          the phone page (keys-page.html): nothing secret in it; the code comes from the address's #fragment
 *   GET  /keys/state    each key's state and last four characters            } the code as Authorization: Bearer;
 *   POST /keys          {"id": "tmdb", "key": "…"}; answers once it's checked }  5 wrong codes lock both for 5 minutes
 * Only from a private, loopback or link-local address; a request must arrive whole within 10 s and at most 64 KB; the
 * key routes answer only while the TV shows its API keys screen (it holds them open, below). Nothing is logged: the
 * body is a key. Keys live in the app's private folder (wgt-private), readable by this app only, never in git.
 *
 * The TV's own screen talks to it on loopback only (and only from the app itself, not from a web page):
 *   GET /ping, GET /tv/keys (the code, address and states), POST /tv/keys/hold (open for 15 s more; the screen repeats it),
 *   POST /tv/keys/release, POST /tv/keys/code (a new code), POST /tv/keys/recheck {"id"}.
 *
 * Each key is checked with one free request to its service (KeyRules.check): 2xx works, 401/403 refused, anything else
 * "not reached" (kept, used, checked again when the screen opens next).
 */
'use strict';

var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var os = require('os');

var VERSION = '0.0.1';
var DEFAULT_PORT = 8766;
var MAX_BODY = 64 * 1024;
var MAX_KEY = 2048;
var MAX_DEPTH = 8;
var MAX_WRONG = 5;
var LOCKOUT_MS = 5 * 60000;
var REQUEST_DEADLINE_MS = 10000;
/** How long one hold from the TV's screen keeps the key routes open; the screen repeats it every few seconds. */
var HOLD_MS = 15000;
var CHECK_MS = 8000;
var STORE_FILE = 'hometv-keys-v1.json';
/** Letters and digits that can't be mistaken for each other when typed off a TV: no 0/O, 1/I/L. */
var CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

var KEY_IDS = ['tmdb', 'watchmode', 'motn'];
var NAMES = { tmdb: 'TMDB', watchmode: 'Watchmode', motn: 'Movie of the Night' };

/**
 * The check for each key (KeyRules.check, tried live 2026-11-02 with good and bad keys): one GET that costs nothing
 * on the free plan, the key in a header, never in the address.
 */
var CHECKS = {
  tmdb: {
    url: 'https://api.themoviedb.org/3/authentication',
    headers: function (k) {
      return { Authorization: 'Bearer ' + k, Accept: 'application/json' };
    }
  },
  watchmode: {
    url: 'https://api.watchmode.com/v1/regions/',
    headers: function (k) {
      return { 'X-API-Key': k };
    }
  },
  motn: {
    url: 'https://api.movieofthenight.com/v4/countries/us',
    headers: function (k) {
      return { 'X-API-Key': k };
    }
  }
};

var MSG = {
  notHome: 'Only phones and laptops on this home network can send keys.',
  locked: 'Too many wrong codes. Try again in a few minutes.',
  notFound: 'Open /keys on the TV’s address.',
  closed: 'The TV stopped listening. Open API keys on the TV, then scan its QR again.',
  wrongCode: 'The TV didn’t accept that code. Check it on the TV, or scan its QR again.',
  unreadable: 'The TV couldn’t read that request.',
  badKey: 'The TV couldn’t read that key.',
  unknownKey: 'The TV doesn’t know that key.',
  empty: 'Paste the key first.',
  tooLong: 'That is too long to be a key.',
  notSaved: 'The TV couldn’t save that key. Try again.',
  tvOnly: 'Only the TV itself opens this.'
};

// ---------------------------------------------------------------- rules (KeyRules.java)

/** The code as typed: case, spaces and dashes don't count. */
function normalizeCode(code) {
  return String(code || '').replace(/[\s-]/g, '').toUpperCase();
}

/** A new code, "K7QM-4PXT": 8 characters from 31, about 40 bits; with the lockout, plenty for a home network. */
function newCode() {
  var out = '';
  while (out.length < 9) {
    var bytes = crypto.randomBytes(16);
    for (var i = 0; i < bytes.length && out.length < 9; i++) {
      // 248 = 31 × 8: bytes above it would make some letters likelier.
      if (bytes[i] >= 248) continue;
      if (out.length === 4) out += '-';
      out += CODE_ALPHABET.charAt(bytes[i] % 31);
    }
  }
  return out;
}

/** Same length and same bytes, compared without stopping at the first difference. */
function sameCode(given, code) {
  var a = normalizeCode(given);
  var b = normalizeCode(code);
  if (!b.length || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Whether a key could be one: TMDB's token is a JWT's characters; a price key is printable ASCII but a space, a double
 * quote or a backslash. At most MAX_KEY.
 */
function validKey(id, key) {
  var k = String(key || '').trim();
  if (!k || k.length > MAX_KEY) return false;
  return id === 'tmdb' ? /^[A-Za-z0-9._-]+$/.test(k) : /^[!#-\[\]-~]+$/.test(k);
}

function last4(key) {
  var k = String(key || '').trim();
  return k.length <= 4 ? k : k.slice(k.length - 4);
}

/** What a check's answer says: 2xx works, 401 or 403 refused; anything else (a limit, an outage) not reached. */
function fromStatus(status) {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 401 || status === 403) return 'bad';
  return 'unreachable';
}

/** What a check leaves: its answer, except that a key that once worked stays working when it can't be reached. */
function afterCheck(before, answer) {
  return before === 'ok' && answer === 'unreachable' ? 'ok' : answer;
}

/** How deep the JSON's brackets go, outside strings. */
function jsonDepth(text) {
  var depth = 0;
  var max = 0;
  var inString = false;
  var escaped = false;
  for (var i = 0; i < text.length; i++) {
    var c = text.charAt(i);
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === '{' || c === '[') {
      depth++;
      if (depth > max) max = depth;
      if (max > MAX_DEPTH) return max;
    } else if (c === '}' || c === ']') {
      if (depth > 0) depth--;
    }
  }
  return max;
}

/** A plain http(s) address in parts, for http.request (Node 4 has no URL class; url.parse is deprecated later). */
function splitUrl(url) {
  var m = /^(https?:)\/\/([^\/:]+)(?::(\d+))?(\/.*)?$/.exec(url) || [];
  return { protocol: m[1], hostname: m[2], port: m[3] ? Number(m[3]) : undefined, path: m[4] || '/' };
}

// ---------------------------------------------------------------- who is asking

function plainAddress(a) {
  return String(a || '').replace(/^::ffff:/i, '');
}

function isLoopbackAddress(a) {
  a = plainAddress(a);
  return a === '::1' || /^127\./.test(a);
}

/** Loopback, private (10/8, 172.16/12, 192.168/16, fc00::/7) or link-local: the home network, not the internet. */
function isHomeAddress(a) {
  a = plainAddress(a);
  return (
    isLoopbackAddress(a) ||
    /^10\./.test(a) ||
    /^192\.168\./.test(a) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(a) ||
    /^169\.254\./.test(a) ||
    /^f[cd][0-9a-f]{2}:/i.test(a) ||
    /^fe[89ab][0-9a-f]:/i.test(a)
  );
}

/**
 * The TV's own screen, not a web page: HomeTV's packaged page sends no Origin, "null", file:// or the app's own
 * scheme (as AeroTizen's watcher trusts it). A web page opened in the TV's browser, or a TizenBrew module
 * (http://127.0.0.1:8081), has an http(s) origin and is refused, so it can't read the code. With `dev` (the PC's
 * `npm run dev` only) the page on http://localhost is let in too. Not covered: a page that hides itself in a sandboxed
 * frame, whose Origin is "null" too (docs/research.md, section 2).
 */
function trustedOrigin(origin, dev) {
  if (!origin) return true;
  if (!/^https?:/i.test(origin)) return true;
  if (!dev) return false;
  var m = /^https?:\/\/([^\/:\[\]]+|\[[0-9a-f:.]+\])(:\d+)?\/?$/i.exec(origin);
  if (!m) return false;
  var host = m[1].toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

/** The TV's addresses on the home network, for the link the phone opens (shown on the TV only). */
function homeAddresses() {
  var out = [];
  var ifaces;
  try {
    ifaces = os.networkInterfaces();
  } catch (e) {
    return out;
  }
  for (var name in ifaces) {
    var list = ifaces[name] || [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) {
        out.push(a.address);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- the private file

/** Reads and writes the keys' file in `dir`: only this app's user may read it (0600), written whole or not at all. */
function fileStore(dir) {
  var file = path.join(dir, STORE_FILE);
  return {
    read: function () {
      try {
        if (fs.statSync(file).size > MAX_BODY) return null;
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (e) {
        return null;
      }
    },
    write: function (data) {
      var temporary = file + '.' + Date.now() + '-' + crypto.randomBytes(4).toString('hex');
      var ok = false;
      try {
        var fd = fs.openSync(temporary, 'wx', 384);
        try {
          fs.writeSync(fd, JSON.stringify(data));
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
        fs.renameSync(temporary, file);
        ok = true;
      } catch (e) {
        ok = false;
      }
      try {
        fs.unlinkSync(temporary);
      } catch (e) {
        // Renamed already, or never made.
      }
      return ok;
    }
  };
}

/** The app's private folder, through the TV's API (AeroTizen's home-store.js does the same). cb(store or null). */
function privateStore(tz, cb) {
  if (!tz || !tz.filesystem || !tz.filesystem.resolve) return cb(null);
  try {
    tz.filesystem.resolve(
      'wgt-private',
      function (dir) {
        try {
          var uri = dir.toURI();
          if (uri.indexOf('file:///') !== 0) return cb(null);
          cb(fileStore(decodeURIComponent(uri.slice(7)).replace(/\/$/, '')));
        } catch (e) {
          cb(null);
        }
      },
      function () {
        cb(null);
      },
      'rw'
    );
  } catch (e) {
    cb(null);
  }
}

// ---------------------------------------------------------------- the service

/**
 * One pages service. opts (all optional; the TV uses none but `tizen`):
 *   port, tizen, dataDir (a folder instead of wgt-private), now (a clock), pageFile,
 *   checkBase (dev and tests: "http://127.0.0.1:<port>" stands in for the three services: <checkBase>/<id>/…),
 *   devOrigins (dev: the page on http://localhost may use the TV's routes), requestDeadlineMs (tests: shorter),
 *   testAddresses (tests: the X-Test-Remote header stands in for the caller's address).
 */
function create(opts) {
  opts = opts || {};
  var port = typeof opts.port === 'number' ? opts.port : DEFAULT_PORT;
  var now = opts.now || Date.now;
  var pageFile = opts.pageFile || path.join(__dirname, 'keys-page.html');
  var deadlineMs = opts.requestDeadlineMs || REQUEST_DEADLINE_MS;
  var store = null;
  var page = null;
  var data = blank();
  var checking = {};
  var revision = { tmdb: 0, watchmode: 0, motn: 0 };
  var wrong = 0;
  var lockedUntil = 0;
  var heldUntil = 0;
  var portTaken = false;

  function blank() {
    return { code: '', keys: { tmdb: { key: '', state: '' }, watchmode: { key: '', state: '' }, motn: { key: '', state: '' } } };
  }

  function load() {
    var saved = store ? store.read() : null;
    data = blank();
    if (saved && typeof saved === 'object') {
      if (typeof saved.code === 'string') data.code = saved.code;
      for (var i = 0; i < KEY_IDS.length; i++) {
        var e = saved.keys && saved.keys[KEY_IDS[i]];
        if (e && typeof e.key === 'string') data.keys[KEY_IDS[i]] = { key: e.key, state: String(e.state || '') };
      }
    }
    if (!data.code) {
      data.code = newCode();
      save();
    }
  }

  function save() {
    return !!store && store.write(data);
  }

  function remote(req) {
    if (opts.testAddresses && req.headers['x-test-remote']) return String(req.headers['x-test-remote']);
    return req.socket.remoteAddress;
  }

  function open() {
    return heldUntil > now();
  }

  /** The state a key shows (KeyRules.state; no build keys on Samsung, so never "built"). */
  function stateOf(id) {
    if (checking[id]) return 'checking';
    var e = data.keys[id];
    if (!e.key) return 'unset';
    return e.state === 'ok' || e.state === 'bad' || e.state === 'unreachable' ? e.state : 'unreachable';
  }

  function states() {
    var out = {};
    for (var i = 0; i < KEY_IDS.length; i++) out[KEY_IDS[i]] = { state: stateOf(KEY_IDS[i]), last4: last4(data.keys[KEY_IDS[i]].key) };
    return out;
  }

  /** One free request to the key's service; cb(state). */
  function checkKey(id, key, cb) {
    var c = CHECKS[id];
    var url = opts.checkBase ? opts.checkBase + '/' + id + splitUrl(c.url).path : c.url;
    var u = splitUrl(url);
    var finished = false;
    var req = null;
    var timer = setTimeout(function () {
      done('unreachable');
    }, CHECK_MS + 2000);
    function done(state) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (req) {
        try {
          req.abort();
        } catch (e) {
          // Gone anyway.
        }
      }
      cb(state);
    }
    try {
      req = (u.protocol === 'https:' ? https : http).request(
        { protocol: u.protocol, hostname: u.hostname, port: u.port, path: u.path, method: 'GET', headers: c.headers(key), agent: false },
        function (res) {
          res.resume();
          var status = res.statusCode;
          req = null;
          done(fromStatus(status));
        }
      );
      req.setTimeout(CHECK_MS, function () {
        done('unreachable');
      });
      req.on('error', function () {
        done('unreachable');
      });
      req.end();
    } catch (e) {
      done('unreachable');
    }
  }

  /** A check's answer, kept only if nothing changed the key since it started. */
  function finishCheck(id, rev, before, answer) {
    if (revision[id] !== rev) return;
    delete checking[id];
    data.keys[id].state = afterCheck(before, answer);
    save();
  }

  /** A key arrived: kept, then checked, then kept with what the check said. cb(false) if it couldn't be saved. */
  function submit(id, key, cb) {
    var k = key.trim();
    var valid = validKey(id, k);
    var previous = data.keys[id];
    var rev = ++revision[id];
    data.keys[id] = { key: k, state: valid ? 'unreachable' : 'bad' };
    if (!save()) {
      data.keys[id] = previous;
      delete checking[id];
      return cb(false);
    }
    if (!valid) {
      delete checking[id];
      return cb(true);
    }
    checking[id] = rev;
    checkKey(id, k, function (answer) {
      finishCheck(id, rev, 'unreachable', answer);
      cb(true);
    });
  }

  /** Check the key kept again: OK on its row on the TV, or one the TV couldn't reach before. */
  function recheck(id) {
    var e = data.keys[id];
    if (!e || !e.key || checking[id]) return;
    var before = stateOf(id);
    var rev = ++revision[id];
    checking[id] = rev;
    if (!validKey(id, e.key)) return finishCheck(id, rev, before, 'bad');
    checkKey(id, e.key, function (answer) {
      finishCheck(id, rev, before, answer);
    });
  }

  function tvState() {
    return {
      ok: true,
      open: open(),
      port: server.address() ? server.address().port : port,
      addresses: homeAddresses(),
      code: data.code,
      saving: !!store,
      portTaken: portTaken,
      keys: states()
    };
  }

  // ------------------------------------------------------------ HTTP

  function reply(res, status, body, extra) {
    // Answered already (the request's deadline passed while a key was checked): the phone asks again.
    if (res.headersSent || res.finished) return;
    var html = typeof body === 'string';
    var text = html ? body : JSON.stringify(body);
    var headers = {
      'Content-Type': (html ? 'text/html' : 'application/json') + '; charset=utf-8',
      'Content-Length': Buffer.byteLength(text),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      Connection: 'close'
    };
    if (html) {
      // The page runs only its own inline script and talks only to the TV that served it.
      headers['Content-Security-Policy'] =
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'";
      headers['Referrer-Policy'] = 'no-referrer';
    }
    for (var h in extra || {}) headers[h] = extra[h];
    res.writeHead(status, headers);
    res.end(text);
  }

  function fail(res, status, message, extra) {
    reply(res, status, { ok: false, message: message }, extra);
  }

  function keysAnswer() {
    return { ok: true, message: '', keys: states() };
  }

  /** The whole body, within MAX_BODY bytes and the request's deadline; cb(text) or answers the error itself. */
  function readBody(req, res, extra, cb) {
    var answered = false;
    function stop(status, message) {
      if (answered) return;
      answered = true;
      fail(res, status, message, extra);
      // Stop reading; the answer goes first.
      req.removeAllListeners('data');
      req.resume();
    }
    if (/chunked/i.test(String(req.headers['transfer-encoding'] || ''))) return stop(400, MSG.unreadable);
    var length = Number(req.headers['content-length'] || 0);
    if (!(length >= 0)) return stop(400, MSG.unreadable);
    if (length > MAX_BODY) return stop(413, MSG.tooLong);
    var size = 0;
    var chunks = [];
    req.on('data', function (c) {
      if (answered) return;
      size += c.length;
      if (size > MAX_BODY) return stop(413, MSG.tooLong);
      chunks.push(c);
    });
    req.on('end', function () {
      if (answered || res.headersSent) return;
      answered = true;
      // Read in time: the key's check that may follow isn't held to the reading deadline.
      clearTimeout(req.hometvDeadline);
      cb(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', function () {
      answered = true;
    });
  }

  function parseJson(req, text) {
    if (!/^application\/json/i.test(String(req.headers['content-type'] || ''))) return null;
    if (jsonDepth(text) > MAX_DEPTH) return null;
    try {
      var o = JSON.parse(text);
      return o && typeof o === 'object' && !(o instanceof Array) ? o : null;
    } catch (e) {
      return null;
    }
  }

  function bearer(req) {
    var m = /^Bearer\s+(.*)$/i.exec(String(req.headers.authorization || ''));
    return m ? m[1].trim() : '';
  }

  /** The phone's routes (KeyInbox.handle). */
  function phone(req, res, url) {
    if (now() < lockedUntil) return fail(res, 429, MSG.locked);
    if (req.method === 'GET' && url === '/keys') {
      if (page === null) {
        try {
          page = fs.readFileSync(pageFile, 'utf8');
        } catch (e) {
          return fail(res, 500, MSG.unreadable);
        }
      }
      return reply(res, 200, page);
    }
    var isState = req.method === 'GET' && url === '/keys/state';
    var isPost = req.method === 'POST' && url === '/keys';
    if (!isState && !isPost) return fail(res, 404, MSG.notFound);
    if (!open()) return fail(res, 503, MSG.closed);
    if (!sameCode(bearer(req), data.code)) {
      if (++wrong >= MAX_WRONG) {
        wrong = 0;
        lockedUntil = now() + LOCKOUT_MS;
      }
      return fail(res, 401, MSG.wrongCode);
    }
    wrong = 0;
    if (isState) return reply(res, 200, keysAnswer());
    var code = data.code;
    readBody(req, res, null, function (text) {
      var o = parseJson(req, text);
      if (!o) return fail(res, 400, MSG.badKey);
      var id = typeof o.id === 'string' ? o.id : '';
      if (KEY_IDS.indexOf(id) < 0) return fail(res, 400, MSG.unknownKey);
      var key = typeof o.key === 'string' ? o.key.trim() : '';
      if (!key) return fail(res, 400, MSG.empty);
      if (key.length > MAX_KEY) return fail(res, 413, MSG.tooLong);
      // Closed, or a new code, while the key was read: it was sent with a code no longer shown.
      if (!open() || code !== data.code) return fail(res, 503, MSG.closed);
      submit(id, key, function (saved) {
        if (!saved) return fail(res, 500, MSG.notSaved);
        reply(res, 200, keysAnswer());
      });
    });
  }

  /** The TV's own screen (loopback only, from the app). */
  function tv(req, res, url) {
    var origin = req.headers.origin;
    if (!trustedOrigin(origin, !!opts.devOrigins)) return fail(res, 403, MSG.tvOnly);
    var cors = origin
      ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
      : {};
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }
    if (req.method === 'GET' && url === '/ping') return reply(res, 200, { ok: true, service: 'hometv-pages', version: VERSION }, cors);
    if (req.method === 'GET' && url === '/tv/keys') return reply(res, 200, tvState(), cors);
    if (req.method !== 'POST') return fail(res, 404, MSG.notFound, cors);
    readBody(req, res, cors, function (text) {
      var o = text ? parseJson(req, text) || {} : {};
      if (url === '/tv/keys/hold') {
        var wasOpen = open();
        heldUntil = now() + HOLD_MS;
        // As the screen opens: the keys the TV couldn't reach before are checked again (ApiKeys.recheckUnreached).
        if (!wasOpen) {
          for (var i = 0; i < KEY_IDS.length; i++) if (stateOf(KEY_IDS[i]) === 'unreachable') recheck(KEY_IDS[i]);
        }
        return reply(res, 200, tvState(), cors);
      }
      if (url === '/tv/keys/release') {
        heldUntil = 0;
        return reply(res, 200, tvState(), cors);
      }
      if (url === '/tv/keys/code') {
        data.code = newCode();
        save();
        return reply(res, 200, tvState(), cors);
      }
      if (url === '/tv/keys/recheck') {
        if (KEY_IDS.indexOf(o.id) >= 0) recheck(o.id);
        return reply(res, 200, tvState(), cors);
      }
      fail(res, 404, MSG.notFound, cors);
    });
  }

  var server = http.createServer(function (req, res) {
    clearTimeout(req.socket.hometvHeadDeadline);
    var addr = remote(req);
    // A whole request within the deadline, however slowly its bytes trickle in.
    var deadline = (req.hometvDeadline = setTimeout(function () {
      // With Connection: close the answer ends the connection; a stuck one is cut.
      if (res.headersSent) req.socket.destroy();
      else fail(res, 400, MSG.unreadable);
    }, deadlineMs));
    res.on('finish', function () {
      clearTimeout(deadline);
    });
    res.on('close', function () {
      clearTimeout(deadline);
    });
    try {
      if (!isHomeAddress(addr)) return fail(res, 403, MSG.notHome);
      var url = String(req.url || '').split('?')[0];
      if (url === '/ping' || url.indexOf('/tv/') === 0) {
        if (!isLoopbackAddress(addr)) return fail(res, 403, MSG.tvOnly);
        return tv(req, res, url);
      }
      phone(req, res, url);
    } catch (e) {
      // One bad request never stops the page; nothing is logged (the body may be a key).
      if (!res.headersSent) fail(res, 400, MSG.unreadable);
    }
  });
  // Idle sockets: longer than a key's check (CHECK_MS), during which the phone's request waits quietly.
  server.timeout = 30000;
  server.maxConnections = 16;
  // The head of a request within the deadline too (Node 4 has no headersTimeout): a connection that trickles its
  // headers in is cut. One request per connection (Connection: close), so the body's deadline takes over from here.
  server.on('connection', function (socket) {
    socket.hometvHeadDeadline = setTimeout(function () {
      socket.destroy();
    }, deadlineMs);
    socket.on('close', function () {
      clearTimeout(socket.hometvHeadDeadline);
    });
  });

  return {
    server: server,
    /** Finds the private folder, reads the keys, then listens on all the TV's addresses. cb(error or null). */
    start: function (cb) {
      cb = cb || function () {};
      function listen(s) {
        store = s;
        load();
        server.once('error', function (e) {
          // Another service holds the port (the TizenBrew module's uses 8766 too).
          portTaken = e && e.code === 'EADDRINUSE';
          cb(e);
        });
        server.listen(port, function () {
          cb(null);
        });
      }
      if (opts.dataDir) {
        try {
          fs.mkdirSync(opts.dataDir);
        } catch (e) {
          // There already.
        }
        listen(fileStore(opts.dataDir));
      } else {
        privateStore(opts.tizen, listen);
      }
    },
    stop: function () {
      heldUntil = 0;
      try {
        server.close();
      } catch (e) {
        // Not listening.
      }
    },
    port: function () {
      return server.address() ? server.address().port : port;
    }
  };
}

// ---------------------------------------------------------------- Tizen's web service lifecycle

var instance = null;

module.exports = {
  create: create,
  onStart: function () {
    if (instance) return;
    instance = create({ tizen: typeof tizen !== 'undefined' ? tizen : null });
    instance.start();
  },
  onRequest: function () {
    // The TV's screen starts this service with an app control; it may come before or instead of onStart.
    if (!instance) module.exports.onStart();
  },
  onExit: function () {
    if (instance) instance.stop();
    instance = null;
  },
  /** For the tests. */
  rules: {
    normalizeCode: normalizeCode,
    newCode: newCode,
    sameCode: sameCode,
    validKey: validKey,
    last4: last4,
    fromStatus: fromStatus,
    afterCheck: afterCheck,
    jsonDepth: jsonDepth,
    isHomeAddress: isHomeAddress,
    isLoopbackAddress: isLoopbackAddress,
    trustedOrigin: trustedOrigin,
    CODE_ALPHABET: CODE_ALPHABET,
    MAX_BODY: MAX_BODY,
    MAX_KEY: MAX_KEY,
    MAX_WRONG: MAX_WRONG,
    LOCKOUT_MS: LOCKOUT_MS,
    HOLD_MS: HOLD_MS
  }
};
