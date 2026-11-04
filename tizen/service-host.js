// Emulator only (see config.xml): a Tizen web service's entry points, wrapping service.js the way TizenBrew's
// serviceLauncher.js does (a vm context with `tizen` and `require`), so the emulator runs the same file the TV will.
// If service.js fails to start, a tiny server on 8767 says why (the emulator has no readable log).
'use strict';

var vm = require('vm');
var fs = require('fs');
var path = require('path');
var http = require('http');

var started = false;
var stage = 'host loaded';
var statusServer = null;

function reportProblem(text) {
  stage = text;
}

// Started as soon as the host file loads, so the page can tell "the service never ran" from "it failed".
try {
  statusServer = http
    .createServer(function (req, res) {
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end(stage);
    })
    .listen(8767, '127.0.0.1');
} catch (e) {
  // Nothing more can be said.
}

module.exports.onStart = function () {
  if (started) return;
  started = true;
  stage = 'onStart called';
  try {
    var sandbox = {};
    Object.getOwnPropertyNames(global).forEach(function (prop) {
      if (['global', 'module'].indexOf(prop) >= 0) return;
      try {
        sandbox[prop] = global[prop];
      } catch (e) {
        // Some globals can't be read outside their context.
      }
    });
    sandbox.require = require;
    sandbox.tizen = global.tizen;
    sandbox.module = { exports: {} };
    var script = fs.readFileSync(path.join(__dirname, 'service.js'), 'utf8');
    vm.runInContext(script, vm.createContext(sandbox));
    var server = sandbox.module.exports.server;
    stage = 'service.js ran';
    if (server) {
      server.on('listening', function () {
        stage = 'listening';
      });
      server.on('error', function (e) {
        reportProblem('listen failed: ' + (e && e.message));
      });
    }
  } catch (e) {
    reportProblem('start failed: ' + (e && (e.stack || e.message)) + ' | node ' + process.version);
  }
};

module.exports.onRequest = function () {};
module.exports.onExit = function () {};
