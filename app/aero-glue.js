// Glue between AeroTizen's plain-ES5 platform scripts (vendor/aerotizen/launcher/js, loaded unmodified before this
// file) and HomeTV's page. Loaded after them and before HomeTV's own script. ES5: the oldest TVs read it as is.
(function (A) {
  "use strict";
  if (!A || !A.config) {
    return;
  }

  // HomeTV's own app and its background watcher (AeroTizen's service/index.js, packaged under this id by
  // tools/package-tizen.mjs), on a port of its own so it never meets an installed AeroTizen.
  A.config.APP_ID = "HmTvSpike0.HomeTVSpike";
  A.config.SERVICE_ID = "HmTvSpike0.HomeTVWatcher";
  A.config.SERVICE_URL = "http://127.0.0.1:47791";
  A.config.HIDDEN_APPS = /service|emanual|companion|dummy|widget|DclHome001|HmTvSpike0/i;

  // AeroTizen's scripts call these for messages; HomeTV's page shows them its own way.
  var pending = [];
  A.toast = function (text) {
    if (window.hometvToast) {
      window.hometvToast(text);
    } else {
      pending.push(text);
    }
  };
  A.toast.flush = function () {
    while (pending.length && window.hometvToast) {
      window.hometvToast(pending.shift());
    }
  };
  var WORDS = {
    "apps.openFailed": "{name} didn’t open.",
    "apps.openFailedDetail": "{name} didn’t open: {reason}",
    "apps.wouldOpen": "On the TV this opens {name}.",
    "apps.wouldOpenStore": "On the TV this opens the app store.",
    "apps.storeFailed": "The app store didn’t open.",
    "handoff.launchDenied": "the TV refused",
    "handoff.launchFailed": "it failed to start",
    "handoff.wouldOpenHome": "On the TV this opens Samsung’s home.",
    "handoff.homeTryAgain": "Try again.",
  };
  A.translate = function (key, values) {
    var text = WORDS[key] || key;
    for (var k in values || {}) {
      text = text.split("{" + k + "}").join(values[k]);
    }
    return text;
  };
  // AeroTizen's fireplace tile isn't part of HomeTV.
  window.Fireplace = window.Fireplace || { open: function () {}, isOpen: function () { return false; } };
})(window.AeroTizen);
