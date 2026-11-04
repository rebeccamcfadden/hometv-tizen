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

export function createMockTizen({ installed = MOCK_INSTALLED, listApps = true, log = () => {}, filesystem } = {}) {
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
  if (filesystem) tizen.filesystem = filesystem;
  return { tizen, calls };
}

/**
 * The TV's files, shared by every "start" of a test: full virtual paths ("wgt-private/pages/1.1.0/assets/app.js")
 * to bytes, and the folders that exist. Only wgt-private is there at first, as on a fresh install.
 */
export function createFsStore() {
  return { files: new Map(), dirs: new Set(['wgt-private']) };
}

const parentOf = (p) => p.slice(0, Math.max(0, p.lastIndexOf('/')));
const joinPath = (a, b) => (b ? `${a}/${b}` : a);

/**
 * A fake `tizen.filesystem` over a store, in one of the two shapes Samsung TVs have:
 * - `openFile` (Tizen 5.0 and newer): openFile/FileHandle, createDirectory, deleteDirectory, pathExists, toURI; the old
 *   resolve() is still there, deprecated, as on real TVs;
 * - `resolve` (Tizen 3 and 4): resolve() to File objects with createDirectory/createFile/openStream (FileStream with
 *   readBase64/writeBase64)/deleteDirectory/toURI, and no openFile.
 * Errors are thrown or passed as WebAPIError (NotFoundError, IOError, InvalidValuesError) as the TV does. `defer`
 * runs the asynchronous callbacks (tests count them to know when the TV is idle).
 */
export function createMockFilesystem({
  api = 'openFile',
  store = createFsStore(),
  defer = (fn) => setImmediate(fn),
  uriRoot = 'file:///opt/usr/home/owner/apps_rw/HmTvSpike0/data',
  calls = [],
} = {}) {
  const { files, dirs } = store;
  const isDir = (p) => dirs.has(p);
  const exists = (p) => files.has(p) || dirs.has(p);
  const notFound = (p) => new WebAPIError('NotFoundError', `No such file or directory: ${p}`);
  const check = (p) => {
    if (typeof p !== 'string' || !/^wgt-private(\/[^/]+)*$/.test(p) || p.split('/').includes('..')) {
      throw new WebAPIError('InvalidValuesError', `Bad path: ${p}`);
    }
  };
  const toURI = (p) => uriRoot + p.slice('wgt-private'.length);
  const removeTree = (p) => {
    for (const f of [...files.keys()]) if (f.startsWith(p + '/')) files.delete(f);
    for (const d of [...dirs]) if (d === p || d.startsWith(p + '/')) dirs.delete(d);
  };
  const call = (ok, value) => ok && defer(() => ok(value));
  const fail = (err, e) => err && defer(() => err(e));

  // ---- the old API: File and FileStream ----

  class FileStream {
    constructor(path, mode) {
      this.path = path;
      this.position = mode === 'a' ? files.get(path).length : 0;
      this.closed = false;
      if (mode === 'w') files.set(path, Buffer.alloc(0));
    }
    get eof() {
      return this.position >= files.get(this.path).length;
    }
    get bytesAvailable() {
      return files.get(this.path).length - this.position;
    }
    open() {
      if (this.closed) throw new WebAPIError('IOError', 'Stream is closed');
    }
    readBase64(n) {
      this.open();
      const data = files.get(this.path).subarray(this.position, this.position + n);
      this.position += data.length;
      return data.toString('base64');
    }
    writeBase64(b64) {
      this.open();
      const data = Buffer.from(b64, 'base64');
      const old = files.get(this.path);
      files.set(this.path, Buffer.concat([old.subarray(0, this.position), data, old.subarray(this.position + data.length)]));
      this.position += data.length;
    }
    read(n) {
      this.open();
      const data = files.get(this.path).subarray(this.position, this.position + n);
      this.position += data.length;
      return data.toString('utf8');
    }
    write(text) {
      this.writeBase64(Buffer.from(text, 'utf8').toString('base64'));
    }
    close() {
      this.closed = true;
    }
  }

  class File {
    constructor(path) {
      this.fullPath = path;
      this.name = path.slice(path.lastIndexOf('/') + 1);
      this.path = parentOf(path) + '/';
    }
    get isDirectory() {
      return isDir(this.fullPath);
    }
    get isFile() {
      return files.has(this.fullPath);
    }
    get fileSize() {
      return files.has(this.fullPath) ? files.get(this.fullPath).length : undefined;
    }
    resolve(rel) {
      calls.push({ fn: 'File.resolve', path: joinPath(this.fullPath, rel) });
      const p = joinPath(this.fullPath, rel);
      check(p);
      if (!exists(p)) throw notFound(p);
      return new File(p);
    }
    createDirectory(rel) {
      const p = joinPath(this.fullPath, rel);
      calls.push({ fn: 'File.createDirectory', path: p });
      check(p);
      if (!this.isDirectory) throw new WebAPIError('IOError', `Not a directory: ${this.fullPath}`);
      if (exists(p)) throw new WebAPIError('IOError', `Already exists: ${p}`);
      if (!isDir(parentOf(p))) throw notFound(parentOf(p));
      dirs.add(p);
      return new File(p);
    }
    createFile(rel) {
      const p = joinPath(this.fullPath, rel);
      calls.push({ fn: 'File.createFile', path: p });
      check(p);
      if (exists(p)) throw new WebAPIError('IOError', `Already exists: ${p}`);
      if (!isDir(parentOf(p))) throw notFound(parentOf(p));
      files.set(p, Buffer.alloc(0));
      return new File(p);
    }
    openStream(mode, ok, err) {
      calls.push({ fn: 'File.openStream', path: this.fullPath, mode });
      if (!files.has(this.fullPath)) return fail(err, notFound(this.fullPath));
      call(ok, new FileStream(this.fullPath, mode));
    }
    deleteDirectory(dirPath, recursive, ok, err) {
      calls.push({ fn: 'File.deleteDirectory', path: dirPath });
      if (!isDir(dirPath) || parentOf(dirPath) !== this.fullPath) return fail(err, notFound(dirPath));
      const children = [...files.keys(), ...dirs].some((p) => p.startsWith(dirPath + '/'));
      if (children && !recursive) return fail(err, new WebAPIError('IOError', `Not empty: ${dirPath}`));
      removeTree(dirPath);
      call(ok);
    }
    deleteFile(filePath, ok, err) {
      calls.push({ fn: 'File.deleteFile', path: filePath });
      if (!files.has(filePath)) return fail(err, notFound(filePath));
      files.delete(filePath);
      call(ok);
    }
    listFiles(ok) {
      const kids = [...files.keys(), ...dirs].filter((p) => parentOf(p) === this.fullPath && p !== this.fullPath);
      call(ok, kids.map((p) => new File(p)));
    }
    toURI() {
      return toURI(this.fullPath);
    }
  }

  const fsApi = {
    resolve(location, ok, err) {
      calls.push({ fn: 'resolve', path: location });
      try {
        check(location);
      } catch (e) {
        return fail(err, e);
      }
      if (!exists(location)) return fail(err, notFound(location));
      call(ok, new File(location));
    },
  };
  if (api === 'resolve') return fsApi;
  if (api !== 'openFile') throw new Error(`unknown filesystem api ${api}`);

  // ---- the new API (Tizen 5.0+): FileHandle ----

  class FileHandle {
    constructor(path, mode) {
      this.path = path;
      this.mode = mode;
      this.closed = false;
      this.position = 0;
    }
    open() {
      if (this.closed) throw new WebAPIError('IOError', 'File handle is closed');
    }
    readData(size) {
      this.open();
      if (this.mode === 'w' || this.mode === 'a') throw new WebAPIError('IOError', 'Not open for reading');
      const all = files.get(this.path);
      const data = all.subarray(this.position, size === undefined ? all.length : this.position + size);
      this.position += data.length;
      return new Uint8Array(data);
    }
    writeData(data) {
      this.open();
      if (this.mode === 'r') throw new WebAPIError('IOError', 'Not open for writing');
      if (!(data instanceof Uint8Array) && Object.prototype.toString.call(data) !== '[object Uint8Array]') {
        throw new WebAPIError('TypeMismatchError', 'writeData needs a Uint8Array');
      }
      files.set(this.path, Buffer.concat([files.get(this.path).subarray(0, this.position), Buffer.from(data)]));
      this.position += data.length;
    }
    close() {
      this.open();
      this.closed = true;
    }
  }

  return Object.assign(fsApi, {
    openFile(path, mode) {
      calls.push({ fn: 'openFile', path, mode });
      check(path);
      if (mode === 'r' || mode === 'rw') {
        if (!files.has(path)) throw notFound(path);
      } else if (mode === 'w' || mode === 'a' || mode === 'rwo') {
        if (!isDir(parentOf(path))) throw notFound(parentOf(path));
        if (isDir(path)) throw new WebAPIError('IOError', `Is a directory: ${path}`);
        if (mode !== 'a' || !files.has(path)) files.set(path, Buffer.alloc(0));
      } else {
        throw new WebAPIError('TypeMismatchError', `Bad mode ${mode}`);
      }
      return new FileHandle(path, mode);
    },
    createDirectory(path, makeParents, ok, err) {
      calls.push({ fn: 'createDirectory', path, makeParents });
      try {
        check(path);
      } catch (e) {
        return fail(err, e);
      }
      if (exists(path)) return fail(err, new WebAPIError('IOError', `Already exists: ${path}`));
      const missing = [];
      for (let p = path; p && !isDir(p); p = parentOf(p)) {
        if (files.has(p)) return fail(err, new WebAPIError('IOError', `A file is in the way: ${p}`));
        missing.push(p);
      }
      if (missing.length > 1 && !makeParents) return fail(err, notFound(parentOf(path)));
      for (const p of missing) dirs.add(p);
      call(ok, path);
    },
    deleteDirectory(path, recursive, ok, err) {
      calls.push({ fn: 'deleteDirectory', path });
      if (!isDir(path)) return fail(err, notFound(path));
      const children = [...files.keys(), ...dirs].some((p) => p.startsWith(path + '/'));
      if (children && !recursive) return fail(err, new WebAPIError('IOError', `Not empty: ${path}`));
      removeTree(path);
      call(ok, parentOf(path));
    },
    pathExists(path) {
      check(path);
      return exists(path);
    },
    toURI(path) {
      check(path);
      return toURI(path);
    },
  });
}
