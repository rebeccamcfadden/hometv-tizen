// Emulator only (see config.xml): a Tizen web service's entry points, wrapping service.js the way TizenBrew's
// serviceLauncher.js does (a vm context with `tizen` and `require`), so the emulator runs the same file the TV will.
'use strict';

var vm = require('vm');
var fs = require('fs');
var path = require('path');

module.exports.onStart = function () {
  var sandbox = {};
  Object.getOwnPropertyNames(global).forEach(function (prop) {
    if (['global', 'module'].indexOf(prop) >= 0) return;
    sandbox[prop] = global[prop];
  });
  sandbox.require = require;
  sandbox.tizen = global.tizen;
  sandbox.module = { exports: {} };
  var script = fs.readFileSync(path.join(__dirname, 'service.js'), 'utf8');
  vm.runInContext(script, vm.createContext(sandbox));
};

module.exports.onRequest = function () {};
module.exports.onExit = function () {};
