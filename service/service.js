/*
 * HomeTV's TizenBrew service. TizenBrew runs this file inside its own background service (Node, as old as 4.4.3 on
 * Tizen 3 TVs) and hands it the TV's real `tizen` object, which the module's page doesn't get. So the page asks this
 * service, over http://127.0.0.1:8766, to open apps; the same server serves the phone pages on the home network.
 *
 * Plain ES5 with Node's built-in modules only (tools/check-legacy.mjs parses it as ES5). Off the TV,
 * tools/dev-service.mjs runs it the way TizenBrew does, with a fake `tizen`.
 *
 * Nothing secret is logged or kept here yet. The spike's checks (POST /check/<name>) write what they found to
 * results.json, which /report shows on a phone so the result can be read out during the TV call.
 */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var os = require('os');

var VERSION = '0.0.1';
var DEV = typeof HOMETV_DEV !== 'undefined' ? HOMETV_DEV : null;
var PORT = DEV && typeof DEV.port === 'number' ? DEV.port : 8766;
/** Samsung's own servers on the TV: the remote-control socket (phone remote apps) and DIAL (casting). */
var REMOTE_PORT = DEV && DEV.remotePort ? DEV.remotePort : 8001;
var DIAL_PORT = DEV && DEV.dialPort ? DEV.dialPort : 8080;
var DATA_DIR = DEV && DEV.dataDir ? DEV.dataDir : '/home/owner/share/hometv-tizen';
var STARTED_AT = Date.now();

// Node 4.4.3 (Tizen 3) has no Buffer.from or Buffer.alloc; newer Nodes warn about `new Buffer`.
var hasNewBuffer = typeof Buffer.alloc === 'function' && Buffer.from !== Uint8Array.from;
function bufFrom(value, encoding) {
  return hasNewBuffer ? Buffer.from(value, encoding) : new Buffer(value, encoding);
}
function bufAlloc(size) {
  return hasNewBuffer ? Buffer.alloc(size) : new Buffer(size);
}

/**
 * Samsung's app ids, newer first: some apps changed id in 2020, and an older TV keeps the old one. Sources in
 * docs/research.md. The page's tiles use the keys.
 */
var APPS = {
  netflix: { name: 'Netflix', ids: ['3201907018807', '11101200001'] },
  youtube: { name: 'YouTube', ids: ['111299001912'] },
  prime: { name: 'Prime Video', ids: ['3201910019365', '3201512006785'] },
  disney: { name: 'Disney+', ids: ['3202204027038', '3202009021709', '3201901017640'] },
  max: { name: 'HBO Max', ids: ['3202301029760', '3201601007230'] },
  appletv: { name: 'Apple TV', ids: ['3201807016597'] },
  hulu: { name: 'Hulu', ids: ['3201601007625'] },
  peacock: { name: 'Peacock', ids: ['3202006020991'] },
  paramount: { name: 'Paramount+', ids: ['3202110025305', '3201710014981'] },
  spotify: { name: 'Spotify', ids: ['3201606009684'] },
  plex: { name: 'Plex', ids: ['3201512006963'] },
  tubi: { name: 'Tubi', ids: ['3201504001965'] },
  pluto: { name: 'Pluto TV', ids: ['3201808016802'] }
};

/** Titles for the title-link checks: one well-known title per service, the Android launcher's link shapes. */
var SAMPLE_TITLES = {
  netflix: { label: 'Stranger Things', url: 'https://www.netflix.com/title/80057281', meta: 'm=80057281' },
  youtube: { label: 'a YouTube video', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', meta: 'v=aqz-KE-bpKQ' },
  prime: {
    label: 'The Boys',
    url: 'https://app.primevideo.com/detail?gti=amzn1.dv.gti.0eb1d3b1-28b0-ebdb-6c2d-2a1e3e9e1e1c',
    meta: 'gti=amzn1.dv.gti.0eb1d3b1-28b0-ebdb-6c2d-2a1e3e9e1e1c'
  }
};

// ---------------------------------------------------------------- results kept for the report

var results = [];

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
}

function loadResults() {
  try {
    results = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'results.json'), 'utf8')) || [];
  } catch (e) {
    results = [];
  }
}

function saveResults() {
  try {
    ensureDir(DATA_DIR);
    fs.writeFileSync(path.join(DATA_DIR, 'results.json'), JSON.stringify(results, null, 1));
  } catch (e) {
    // The report still shows this session's results.
  }
}

function record(check, ok, detail) {
  var r = { at: new Date().toISOString(), check: check, ok: ok, detail: detail };
  results.push(r);
  if (results.length > 200) results.shift();
  saveResults();
  return r;
}

// ---------------------------------------------------------------- the TV's own functions

function hasTizen() {
  return typeof tizen !== 'undefined' && tizen && tizen.application;
}

function errText(e) {
  if (!e) return 'unknown error';
  return (e.name ? e.name + ': ' : '') + (e.message || String(e));
}

/** Calls fn(done) and answers once, even if fn throws or calls done twice; gives up after ms. */
function once(ms, fn, cb) {
  var finished = false;
  var timer = setTimeout(function () {
    finish(false, 'no answer after ' + ms + ' ms');
  }, ms);
  function finish(ok, detail) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    cb(ok, detail);
  }
  try {
    fn(finish);
  } catch (e) {
    finish(false, errText(e));
  }
}

/** Opens an app by its first id that the TV accepts. cb(ok, idThatWorked, tried). */
function launchApp(key, cb) {
  var app = APPS[key];
  if (!app) return cb(false, null, [{ id: null, error: 'unknown app ' + key }]);
  launchIds(app.ids, cb);
}

/** Tries each id in turn until the TV opens one. cb(ok, idThatWorked, tried). */
function launchIds(ids, cb) {
  if (!hasTizen()) return cb(false, null, [{ id: null, error: 'no tizen object' }]);
  var tried = [];
  var i = 0;
  (function next() {
    if (i >= ids.length) return cb(false, null, tried);
    var id = ids[i++];
    once(
      8000,
      function (done) {
        tizen.application.launch(
          id,
          function () {
            done(true, null);
          },
          function (e) {
            done(false, errText(e));
          }
        );
      },
      function (ok, error) {
        tried.push({ id: id, error: ok ? null : error });
        if (ok) cb(true, id, tried);
        else next();
      }
    );
  })();
}

var installedCache = null;

/** Which known apps the TV says are installed; cb(null) when it won't list them. */
function installedApps(cb) {
  if (installedCache) return cb(installedCache, null);
  if (!hasTizen() || !tizen.application.getAppsInfo) return cb(null, 'no getAppsInfo');
  once(
    8000,
    function (done) {
      tizen.application.getAppsInfo(
        function (list) {
          done(true, list);
        },
        function (e) {
          done(false, errText(e));
        }
      );
    },
    function (ok, listOrError) {
      if (!ok) return cb(null, listOrError);
      var ids = {};
      for (var i = 0; i < listOrError.length; i++) ids[listOrError[i].id] = listOrError[i].name || true;
      installedCache = { ids: ids, count: listOrError.length, apps: realApps(listOrError) };
      cb(installedCache, null);
    }
  );
}

/** Store apps have 10-character package ids; everything else the TV lists is the firmware's own (AeroTizen's rule). */
var STORE_PACKAGE = /^[A-Za-z0-9]{10}$/;
/** Never shown in All apps, nor opened from it: services, the manual, widgets, HomeTV's own parts. */
var HIDDEN_APPS = /service|emanual|companion|dummy|widget|DclHome001|HmTvSpike0/i;
/** Streaming apps a Samsung comes with, under firmware-style ids (AeroTizen's app-catalog.js, "preloaded"). */
var PRELOADED_IDS = ['org.tizen.netflix-app', 'org.tizen.primevideo', 'com.samsung.tv.aria-video'];

function isKnownId(id) {
  if (PRELOADED_IDS.indexOf(id) >= 0) return true;
  for (var key in APPS) if (APPS[key].ids.indexOf(id) >= 0) return true;
  return false;
}

/** The apps a person would open, from the TV's full list, by name: what All apps shows. */
function realApps(list) {
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var a = list[i];
    if (!a || !a.id || !a.name || a.show === false) continue;
    if (HIDDEN_APPS.test(a.id) || HIDDEN_APPS.test(a.name)) continue;
    if (a.packageId && !STORE_PACKAGE.test(a.packageId) && !isKnownId(a.id)) continue;
    out.push({ id: a.id, name: a.name });
  }
  out.sort(function (x, y) {
    return x.name.toLowerCase() < y.name.toLowerCase() ? -1 : x.name.toLowerCase() > y.name.toLowerCase() ? 1 : 0;
  });
  return out;
}

function capability(key) {
  try {
    return tizen.systeminfo.getCapability(key);
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------- the spike's checks

var CHECKS = {};

/** The TV's model, Tizen version and this service's Node, plus how long the service has been running. */
CHECKS.info = function (params, cb) {
  var info = {
    model: hasTizen() ? capability('http://tizen.org/system/model_name') : null,
    tizen: hasTizen() ? capability('http://tizen.org/feature/platform.version') : null,
    node: process.version,
    serviceVersion: VERSION,
    serviceStartedAt: new Date(STARTED_AT).toISOString(),
    serviceUpMinutes: Math.round((Date.now() - STARTED_AT) / 60000)
  };
  cb(!!info.tizen, info);
};

/** Does the TV list its installed apps for TizenBrew? Which known ids are among them? */
CHECKS.apps = function (params, cb) {
  installedCache = null;
  installedApps(function (inst, error) {
    if (!inst) return cb(false, { error: error });
    var found = {};
    for (var key in APPS) {
      for (var i = 0; i < APPS[key].ids.length; i++) {
        if (inst.ids[APPS[key].ids[i]]) found[key] = APPS[key].ids[i];
      }
    }
    cb(true, { count: inst.count, known: found });
  });
};

/** Opens an app by id, trying each of its ids. */
CHECKS.launch = function (params, cb) {
  launchApp(params.app, function (ok, id, tried) {
    cb(ok, { app: params.app, opened: id, tried: tried });
  });
};

/** Title link, way 1: an app control with the title's web link, sent to the app. */
CHECKS.linkAppControl = function (params, cb) {
  var t = SAMPLE_TITLES[params.app];
  var app = APPS[params.app];
  if (!t || !app) return cb(false, { error: 'no sample title for ' + params.app });
  if (!hasTizen()) return cb(false, { error: 'no tizen object' });
  var i = 0;
  var tried = [];
  (function next() {
    if (i >= app.ids.length) return cb(false, { app: params.app, url: t.url, tried: tried });
    var id = app.ids[i++];
    once(
      8000,
      function (done) {
        // YouTube takes the video as PAYLOAD with no link (AeroTizen's fireplace tile, device-tested); the others get
        // the title's web link.
        var uri = params.app === 'youtube' ? null : t.url;
        var control = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/view', uri, null, null, [
          new tizen.ApplicationControlData('PAYLOAD', [JSON.stringify({ values: t.meta })])
        ]);
        tizen.application.launchAppControl(
          control,
          id,
          function () {
            done(true, null);
          },
          function (e) {
            done(false, errText(e));
          }
        );
      },
      function (ok, error) {
        tried.push({ id: id, error: ok ? null : error });
        if (ok) cb(true, { app: params.app, url: t.url, sentTo: id, note: 'Did the title open, or only the app?' });
        else next();
      }
    );
  })();
};

/** Title link, way 2: Samsung's remote-control socket, "DEEP_LINK" launch with the title as data. */
CHECKS.linkRemote = function (params, cb) {
  var t = SAMPLE_TITLES[params.app];
  var app = APPS[params.app];
  if (!t || !app) return cb(false, { error: 'no sample title for ' + params.app });
  var name = bufFrom('HomeTV').toString('base64');
  wsSendOnce(
    REMOTE_PORT,
    '/api/v2/channels/samsung.remote.control?name=' + name,
    function (event) {
      // The TV says "connected" once it accepts this client (the first time it may ask on screen).
      if (event.event !== 'ms.channel.connect') return null;
      return JSON.stringify({
        method: 'ms.channel.emit',
        params: {
          event: 'ed.apps.launch',
          to: 'host',
          data: { appId: app.ids[0], action_type: 'DEEP_LINK', metaTag: t.meta }
        }
      });
    },
    12000,
    function (ok, detail) {
      detail.app = params.app;
      detail.metaTag = t.meta;
      if (ok) detail.note = 'Did the title open, or only the app? Did the TV ask to allow "HomeTV"?';
      cb(ok, detail);
    }
  );
};

/** Title link, way 3 (YouTube only): DIAL, as a phone casting YouTube does. */
CHECKS.linkDial = function (params, cb) {
  var body = 'v=aqz-KE-bpKQ';
  var req = http.request(
    {
      host: '127.0.0.1',
      port: DIAL_PORT,
      method: 'POST',
      path: '/ws/apps/YouTube',
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(body) }
    },
    function (res) {
      res.resume();
      cb(res.statusCode >= 200 && res.statusCode < 300, {
        status: res.statusCode,
        location: res.headers.location || null,
        note: 'Did the video play, or did YouTube open a "connect" pane?'
      });
    }
  );
  req.setTimeout(8000, function () {
    req.abort();
  });
  req.on('error', function (e) {
    cb(false, { error: errText(e) });
  });
  req.end(body);
};

/** Whether a phone reached this service: the report page records each visit from another address. */
CHECKS.phone = function (params, cb) {
  var seen = results.filter(function (r) {
    return r.check === 'phone-visit';
  });
  cb(seen.length > 0, { visits: seen.length, last: seen.length ? seen[seen.length - 1].at : null });
};

/** What the page measured: how long it took to show Home, and its web engine (from the user agent). */
CHECKS.timing = function (params, cb) {
  var ua = String(params.userAgent || '');
  var chrome = /Chrome\/(\d+)/.exec(ua);
  cb(true, {
    homeShownMs: Number(params.homeShownMs) || null,
    serviceFoundMs: Number(params.serviceFoundMs) || null,
    chromium: chrome ? Number(chrome[1]) : null,
    screen: String(params.screen || '').slice(0, 20)
  });
};

/** The TV's addresses on the home network, for the link the phone types (shown on the TV only, never recorded). */
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
      if (a.family === 'IPv4' && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) {
        out.push(a.address);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- a minimal WebSocket client (Node 4 has none)

/**
 * Connects to ws://127.0.0.1:<port><path>, answers the first message `reply` returns text for, then waits briefly
 * for the TV's answer. cb(ok, { events: [...] }).
 */
function wsSendOnce(port, wsPath, reply, ms, cb) {
  var key = crypto.randomBytes(16).toString('base64');
  var events = [];
  var sent = false;
  var finished = false;
  var socket = null;
  var timer = setTimeout(function () {
    finish(sent, sent ? null : 'no answer after ' + ms + ' ms');
  }, ms);

  function finish(ok, error) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    if (socket) socket.destroy();
    var detail = { events: events };
    if (error) detail.error = error;
    cb(ok, detail);
  }

  var req = http.request({
    host: '127.0.0.1',
    port: port,
    path: wsPath,
    headers: {
      Connection: 'Upgrade',
      Upgrade: 'websocket',
      'Sec-WebSocket-Key': key,
      'Sec-WebSocket-Version': '13'
    }
  });
  req.on('error', function (e) {
    finish(false, errText(e));
  });
  req.on('response', function (res) {
    res.resume();
    finish(false, 'refused the socket: HTTP ' + res.statusCode);
  });
  req.on('upgrade', function (res, sock, head) {
    socket = sock;
    var buffer = head && head.length ? head : bufAlloc(0);
    function readFrames() {
      for (;;) {
        var frame = parseFrame(buffer);
        if (!frame) return;
        buffer = buffer.slice(frame.size);
        if (frame.opcode === 8) return finish(sent, sent ? null : 'closed by the TV');
        if (frame.opcode !== 1) continue;
        var event;
        try {
          event = JSON.parse(frame.payload.toString('utf8'));
        } catch (e) {
          event = { raw: frame.payload.toString('utf8').slice(0, 200) };
        }
        events.push(summarise(event));
        if (!sent) {
          var text = reply(event);
          if (text) {
            sock.write(textFrame(text));
            sent = true;
            // Give the TV a moment to say what it did with it.
            clearTimeout(timer);
            timer = setTimeout(function () {
              finish(true, null);
            }, 3000);
          }
        }
      }
    }
    sock.on('data', function (chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      readFrames();
    });
    sock.on('error', function (e) {
      finish(sent, errText(e));
    });
    sock.on('close', function () {
      finish(sent, sent ? null : 'closed by the TV');
    });
    readFrames();
  });
  req.end();
}

/** Keeps an event's name and a short look at its data (the TV's token stays out of the report). */
function summarise(event) {
  var out = { event: event.event || null };
  if (event.data && typeof event.data === 'object') {
    var keys = [];
    for (var k in event.data) if (k !== 'token') keys.push(k);
    out.dataKeys = keys;
  } else if (event.raw) {
    out.raw = event.raw;
  }
  return out;
}

function textFrame(text) {
  var payload = bufFrom(text, 'utf8');
  var mask = crypto.randomBytes(4);
  var len = payload.length;
  var header;
  if (len < 126) {
    header = bufAlloc(2);
    header[1] = 0x80 | len;
  } else if (len < 65536) {
    header = bufAlloc(4);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    throw new Error('frame too long');
  }
  header[0] = 0x81;
  var masked = bufAlloc(len);
  for (var i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
  return Buffer.concat([header, mask, masked]);
}

/** One frame from the start of buf, or null if it isn't all there yet. Server frames aren't masked. */
function parseFrame(buf) {
  if (buf.length < 2) return null;
  var opcode = buf[0] & 0x0f;
  var len = buf[1] & 0x7f;
  var offset = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = buf.readUInt32BE(6);
    offset = 10;
  }
  var masked = (buf[1] & 0x80) !== 0;
  var maskKey = null;
  if (masked) {
    if (buf.length < offset + 4) return null;
    maskKey = buf.slice(offset, offset + 4);
    offset += 4;
  }
  if (buf.length < offset + len) return null;
  var payload = buf.slice(offset, offset + len);
  if (maskKey) {
    var copy = bufAlloc(len);
    for (var i = 0; i < len; i++) copy[i] = payload[i] ^ maskKey[i % 4];
    payload = copy;
  }
  return { opcode: opcode, payload: payload, size: offset + len };
}

// ---------------------------------------------------------------- HTTP

function send(res, status, type, body) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(body);
}

function json(res, status, value) {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(value));
}

function readBody(req, cb) {
  var size = 0;
  var chunks = [];
  req.on('data', function (c) {
    size += c.length;
    if (size > 16384) {
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', function () {
    var text = Buffer.concat(chunks).toString('utf8');
    if (!text) return cb({});
    try {
      cb(JSON.parse(text));
    } catch (e) {
      cb(null);
    }
  });
}

function isLoopback(req) {
  var a = req.socket.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

/** Private, loopback or link-local addresses only, as the Android launcher's KeyInbox. */
function isHomeNetwork(req) {
  var a = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  return (
    isLoopback(req) ||
    /^10\./.test(a) ||
    /^192\.168\./.test(a) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(a) ||
    /^169\.254\./.test(a) ||
    /^f[cd][0-9a-f]{2}:/i.test(a) ||
    /^fe80:/i.test(a)
  );
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function reportPage() {
  var rows = results
    .slice()
    .reverse()
    .map(function (r) {
      return (
        '<tr><td>' +
        escapeHtml(new Date(r.at).toTimeString().slice(0, 8)) +
        '</td><td>' +
        escapeHtml(r.check) +
        '</td><td>' +
        (r.ok ? 'yes' : 'no') +
        '</td><td><code>' +
        escapeHtml(JSON.stringify(r.detail)) +
        '</code></td></tr>'
      );
    })
    .join('');
  return (
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
    '<title>HomeTV checks</title><style>body{font:16px system-ui;margin:16px}table{border-collapse:collapse}' +
    'td{border-top:1px solid #ccc;padding:6px;vertical-align:top}code{word-break:break-all}</style>' +
    '<h1>HomeTV checks</h1><p>Your phone reached the TV. Copy this page, or the plain text at ' +
    '<a href="/report.txt">/report.txt</a>, into the chat.</p><table>' +
    rows +
    '</table>'
  );
}

function reportText() {
  return results
    .map(function (r) {
      return r.at + ' ' + r.check + ' ' + (r.ok ? 'yes' : 'no') + ' ' + JSON.stringify(r.detail);
    })
    .join('\n');
}

var server = http.createServer(function (req, res) {
  if (!isHomeNetwork(req)) return send(res, 403, 'text/plain', 'Home network only.');
  if (req.method === 'OPTIONS') return send(res, 204, 'text/plain', '');
  var url = req.url.split('?')[0];

  if (url === '/ping') {
    return json(res, 200, {
      ok: true,
      version: VERSION,
      tizen: !!hasTizen(),
      fake: !!DEV,
      startedAt: new Date(STARTED_AT).toISOString(),
      addresses: isLoopback(req) ? homeAddresses() : []
    });
  }

  if (url === '/apps' && req.method === 'GET') {
    return installedApps(function (inst) {
      var list = [];
      for (var key in APPS) {
        var installed = null;
        if (inst) {
          installed = false;
          for (var i = 0; i < APPS[key].ids.length; i++) if (inst.ids[APPS[key].ids[i]]) installed = true;
        }
        list.push({ key: key, name: APPS[key].name, installed: installed });
      }
      json(res, 200, { apps: list, listed: !!inst });
    });
  }

  // Every app a person would open (All apps), not only the known ones.
  if (url === '/apps/all' && req.method === 'GET') {
    return installedApps(function (inst, error) {
      json(res, 200, { apps: inst ? inst.apps : [], listed: !!inst, error: inst ? undefined : error });
    });
  }

  if (url === '/launch' && req.method === 'POST') {
    if (!isLoopback(req)) return send(res, 403, 'text/plain', 'Only the TV itself opens apps.');
    return readBody(req, function (body) {
      if (body && typeof body.id === 'string') {
        // Any app All apps shows, by the TV's own id; nothing else (no firmware parts, no factory menus).
        return installedApps(function (inst) {
          var listed = false;
          if (inst) for (var i = 0; i < inst.apps.length; i++) if (inst.apps[i].id === body.id) listed = true;
          if (!listed) return json(res, 200, { ok: false, id: null, tried: [{ id: body.id, error: 'not an app this TV lists' }] });
          launchIds([body.id], function (ok, id, tried) {
            record('launch:' + body.id, ok, { opened: id, tried: tried });
            json(res, 200, { ok: ok, id: id, tried: tried });
          });
        });
      }
      if (!body || !body.app) return json(res, 400, { ok: false, error: 'which app?' });
      launchApp(body.app, function (ok, id, tried) {
        record('launch:' + body.app, ok, { opened: id, tried: tried });
        json(res, 200, { ok: ok, id: id, tried: tried });
      });
    });
  }

  var m = /^\/check\/([A-Za-z]+)$/.exec(url);
  if (m && req.method === 'POST') {
    if (!isLoopback(req)) return send(res, 403, 'text/plain', 'Only the TV itself runs checks.');
    var check = CHECKS[m[1]];
    if (!check) return json(res, 404, { ok: false, error: 'no such check' });
    return readBody(req, function (body) {
      var params = body || {};
      check(params, function (ok, detail) {
        var name = m[1] + (params.app ? ':' + params.app : '');
        json(res, 200, record(name, ok, detail));
      });
    });
  }

  if (url === '/results' && req.method === 'GET') return json(res, 200, results);

  if (url === '/report' || url === '/report.txt') {
    if (!isLoopback(req)) record('phone-visit', true, { page: url });
    return url === '/report'
      ? send(res, 200, 'text/html; charset=utf-8', reportPage())
      : send(res, 200, 'text/plain; charset=utf-8', reportText());
  }

  if (url === '/reset' && req.method === 'POST' && isLoopback(req)) {
    results = [];
    saveResults();
    return json(res, 200, { ok: true });
  }

  send(res, 404, 'text/plain', 'Not found.');
});

server.on('error', function (e) {
  // Already running (TizenBrew starts a service once per module launch and keeps it): the old one answers.
  if (e.code !== 'EADDRINUSE') record('service-error', false, { error: errText(e) });
});

loadResults();
server.listen(PORT, '0.0.0.0');

module.exports = { server: server, APPS: APPS, CHECKS: CHECKS, parseFrame: parseFrame, textFrame: textFrame, realApps: realApps };
