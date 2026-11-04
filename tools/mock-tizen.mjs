// A stand-in for the TV's `tizen` object, for running service/service.js on a PC. It behaves like a 2019 Samsung
// (Tizen 5.0): Netflix and Prime Video under their pre-2020 ids, no Hulu or Peacock. Every call is recorded in
// `calls`, so tests and the dev log can say what the service asked the TV to do.

/** The apps on the pretend TV, by id. */
export const MOCK_INSTALLED = {
  '11101200001': 'Netflix',
  '111299001912': 'YouTube',
  '3201512006785': 'Prime Video',
  '3201901017640': 'Disney+',
  '3201601007230': 'HBO Max',
  '3201807016597': 'Apple TV',
  '3201606009684': 'Spotify',
  '3201512006963': 'Plex',
  'xvvl3S1bvH.TizenBrewStandalone': 'TizenBrew',
};

class WebAPIError extends Error {
  constructor(name, message) {
    super(message);
    this.name = name;
  }
}

export function createMockTizen({ installed = MOCK_INSTALLED, listApps = true, log = () => {} } = {}) {
  const calls = [];
  const later = (fn) => setTimeout(fn, 30);

  class ApplicationControl {
    constructor(operation, uri, mime, category, data) {
      Object.assign(this, { operation, uri, mime, category, data: data || [] });
    }
  }
  class ApplicationControlData {
    constructor(key, value) {
      Object.assign(this, { key, value });
    }
  }

  const tizen = {
    ApplicationControl,
    ApplicationControlData,
    application: {
      launch(id, ok, err) {
        calls.push({ fn: 'launch', id });
        const name = installed[id];
        log(name ? `launch ${id}: opens ${name}` : `launch ${id}: not installed`);
        later(() => (name ? ok && ok() : err && err(new WebAPIError('NotFoundError', `No app ${id}`))));
      },
      launchAppControl(control, id, ok, err) {
        calls.push({ fn: 'launchAppControl', id, uri: control.uri, operation: control.operation });
        const name = installed[id];
        log(name ? `app control to ${name} (${control.uri})` : `app control ${id}: not installed`);
        later(() => (name ? ok && ok() : err && err(new WebAPIError('NotFoundError', `No app ${id}`))));
      },
      getAppsInfo(ok, err) {
        calls.push({ fn: 'getAppsInfo' });
        if (!listApps) return later(() => err(new WebAPIError('SecurityError', 'application.info not granted')));
        later(() => ok(Object.entries(installed).map(([id, name]) => ({ id, name }))));
      },
      getAppInfo() {
        return { id: 'xvvl3S1bvH.TizenBrewStandalone', packageId: 'xvvl3S1bvH' };
      },
    },
    systeminfo: {
      getCapability(key) {
        return {
          'http://tizen.org/system/model_name': 'MOCK-UN55RU7100 (2019)',
          'http://tizen.org/feature/platform.version': '5.0',
        }[key];
      },
    },
  };
  return { tizen, calls };
}
