/**
 * mopsa_api.js (jsoo backend)
 *
 * Sets up window.mopsaJs synchronously, with the same interface as the
 * WASM backend (backend/wasm/mopsa_api.js), but backed by the analyzer
 * compiled to pure JavaScript with js_of_ocaml (mopsa_worker_jsoo.js).
 *
 * Unlike the WASM worker (which re-instantiates a fresh module per run),
 * the jsoo worker keeps its OCaml runtime state across runs, so the
 * worker is terminated and respawned after every batch result / session
 * end to guarantee a fresh analyzer state.
 */
(function () {
  "use strict";

  var WORKER_URL = "./mopsa_worker_jsoo.js";

  // ── Default values ──────────────────────────────────────────────────────
  var CONFIG_UNI =
    '{"language":"universal","domain":{"switch":[' +
    '"universal.iterators.program","universal.iterators.intraproc",' +
    '"universal.iterators.loops","universal.iterators.interproc.inlining",' +
    '"universal.iterators.unittest",{"nonrel":{"union":[' +
    '"universal.numeric.values.intervals.float",' +
    '"universal.strings.powerset"]}},' +
    '"universal.numeric.collecting"]}}';

  // ── Mutable state ────────────────────────────────────────────────────────
  var _codeFile = "/code.c";
  var _code = "int main() { return 0; }\n";
  var _config = CONFIG_UNI;
  var _extraFiles = {}; // path → content

  // ── Share directory ──────────────────────────────────────────────────────
  // The analyzer needs the share dir (python stubs, configs) in its virtual
  // filesystem. Reuse the frontend's share.json (generated from
  // deps/mopsa-analyzer/share/mopsa for the presets UI) instead of baking a
  // second copy into the worker bundle. Only the jsoo-relevant subtrees are
  // sent (no C stubs). Resolves to {relative path → content}.
  function _flattenTree(tree, prefix, out) {
    Object.keys(tree || {}).forEach(function (k) {
      var v = tree[k];
      if (typeof v === "string") out[prefix + k] = v;
      else _flattenTree(v, prefix + k + "/", out);
    });
  }

  var _shareFilesPromise = fetch("./share.json")
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      var out = {};
      var configs = data.configs || {};
      var stubs = data.stubs || {};
      _flattenTree(configs.universal, "configs/universal/", out);
      _flattenTree(configs.python, "configs/python/", out);
      _flattenTree(stubs.python, "stubs/python/", out);
      return out;
    })
    .catch(function (e) {
      console.error("[Mopsa jsoo] failed to load share.json:", e);
      return {};
    });

  // ── Worker setup ─────────────────────────────────────────────────────────
  var _worker = null;
  var _pending = {}; // id → resolve function (batch analyses)
  var _nextId = 0;
  var _session = null; // active interactive/dap session handle, or null

  function _respawnWorker() {
    if (_worker) _worker.terminate();
    _spawnWorker();
  }

  function _handleMessage(event) {
    var msg = event.data;
    if (!msg) return;
    switch (msg.type) {
      case "result": // batch analysis finished
        if (_pending[msg.id]) {
          var resolve = _pending[msg.id];
          delete _pending[msg.id];
          resolve(msg.output);
          // jsoo runtime state persists across runs → always start the
          // next run from a fresh worker.
          _respawnWorker();
        }
        break;
      case "started":
        if (_session && _session._id === msg.id) _session._emit("started");
        break;
      case "stdout-bytes":
        if (_session && _session._id === msg.id) _session._emit("data", msg.bytes);
        break;
      case "session-ended":
        if (_session && _session._id === msg.id) {
          var ended = _session;
          _session = null;
          _respawnWorker();
          ended._emit("end", msg.code);
        }
        break;
      case "session-error":
        if (_session && _session._id === msg.id) {
          var errored = _session;
          _session = null;
          _respawnWorker();
          errored._emit("error", msg.message);
        }
        break;
    }
  }

  function _handleError(e) {
    console.error("[Mopsa jsoo] Worker error:", e);
    // ErrorEvent.message is often empty (e.g. worker crash) and
    // String(event) is "[object Event]" — give something readable instead.
    var emsg =
      "[Worker error] " +
      ((e && e.message) ||
        "the analysis worker crashed unexpectedly (see the browser console)");
    Object.keys(_pending).forEach(function (id) {
      _pending[id](emsg);
      delete _pending[id];
    });
    if (_session) {
      var s = _session;
      _session = null;
      s._emit("error", emsg);
    }
  }

  // Settle every queued/in-flight batch analysis as superseded (resolved
  // with null so the React layer keeps the previous result on screen).
  function _cancelPendingBatches() {
    Object.keys(_pending).forEach(function (id) {
      var resolve = _pending[id];
      delete _pending[id];
      resolve(null);
    });
  }

  function _spawnWorker() {
    _worker = new Worker(WORKER_URL);
    _worker.onmessage = _handleMessage;
    _worker.onerror = _handleError;
  }
  _spawnWorker();

  // ── Public API ───────────────────────────────────────────────────────────
  window.mopsaJs = {
    configUni: CONFIG_UNI,

    /**
     * analyze(options: string[]) → Promise<string | null>
     *
     * Same supersede semantics as the WASM backend: a new analyze()
     * cancels any in-flight/queued one (resolved with null) and restarts
     * from a fresh worker.
     */
    analyze: function (options) {
      if (!_session && Object.keys(_pending).length > 0) {
        _cancelPendingBatches();
        _respawnWorker();
      }
      return new Promise(function (resolve) {
        var id = _nextId++;
        _pending[id] = resolve;
        var worker = _worker; // bind before the async share fetch
        _shareFilesPromise.then(function (shareFiles) {
          // superseded (or killed) while waiting for share.json
          if (!_pending[id] || worker !== _worker) return;
          worker.postMessage({
            type: "analyze",
            id: id,
            options: options || [],
            code: _code,
            config: _config,
            codeFile: _codeFile,
            extraFiles: _extraFiles,
            shareFiles: shareFiles,
          });
        });
      });
    },

    /**
     * startSession(engine, options) → SessionHandle
     * Same contract as the WASM backend (needs cross-origin isolation).
     */
    startSession: function (engine, options) {
      if (typeof SharedArrayBuffer === "undefined" || !self.crossOriginIsolated) {
        throw new Error(
          "The " +
            engine +
            " engine needs cross-origin isolation (SharedArrayBuffer). " +
            "Serve COOP/COEP headers.",
        );
      }
      if (_session) _session.kill(); // one session at a time

      var id = _nextId++;
      var channel = self.syncMessage.makeChannel({
        atomics: { bufferSize: 256 * 1024 },
      });
      var listeners = { started: [], data: [], end: [], error: [] };

      var handle = {
        engine: engine,
        _id: id,
        _emit: function (ev, arg) {
          listeners[ev].slice().forEach(function (cb) {
            cb(arg);
          });
        },
        onStarted: function (cb) {
          listeners.started.push(cb);
        },
        onData: function (cb) {
          listeners.data.push(cb);
        },
        onEnd: function (cb) {
          listeners.end.push(cb);
        },
        onError: function (cb) {
          listeners.error.push(cb);
        },
        sendInput: function (data) {
          self.syncMessage.writeMessage(channel, { data: data });
        },
        sendEof: function () {
          self.syncMessage.writeMessage(channel, { eof: true });
        },
        kill: function () {
          var wasActive = _session === handle;
          if (wasActive) _session = null;
          // The worker may be blocked in Atomics.wait; terminate + respawn
          // is the only reliable interrupt.
          _respawnWorker();
          if (wasActive) handle._emit("end", -1);
        },
      };
      _session = handle;

      var worker = _worker;
      _shareFilesPromise.then(function (shareFiles) {
        if (_session !== handle || worker !== _worker) return; // killed meanwhile
        worker.postMessage({
          type: "start",
          id: id,
          engine: engine,
          options: options || [],
          code: _code,
          config: _config,
          codeFile: _codeFile,
          extraFiles: _extraFiles,
          shareFiles: shareFiles,
          stdinChannel: channel,
        });
      });

      return handle;
    },

    /**
     * startBackgroundSession(engine, options) → SessionHandle
     *
     * Like startSession, but on its OWN dedicated Worker, so it coexists
     * with batch analyses and the foreground interactive/dap session. Used
     * for long-lived auxiliary runs, e.g. the editor-hover DAP session.
     * kill() terminates the dedicated worker outright.
     */
    startBackgroundSession: function (engine, options) {
      if (typeof SharedArrayBuffer === "undefined" || !self.crossOriginIsolated) {
        throw new Error(
          "The " +
            engine +
            " engine needs cross-origin isolation (SharedArrayBuffer). " +
            "Serve COOP/COEP headers.",
        );
      }

      var id = _nextId++;
      var worker = new Worker(WORKER_URL);
      var channel = self.syncMessage.makeChannel({
        atomics: { bufferSize: 256 * 1024 },
      });
      var listeners = { started: [], data: [], end: [], error: [] };
      var alive = true;

      function emit(ev, arg) {
        listeners[ev].slice().forEach(function (cb) {
          cb(arg);
        });
      }
      function shutdown() {
        if (!alive) return;
        alive = false;
        worker.terminate();
      }

      worker.onmessage = function (event) {
        var msg = event.data;
        if (!msg || msg.id !== id) return;
        switch (msg.type) {
          case "started":
            emit("started");
            break;
          case "stdout-bytes":
            emit("data", msg.bytes);
            break;
          case "session-ended":
            shutdown();
            emit("end", msg.code);
            break;
          case "session-error":
            shutdown();
            emit("error", msg.message);
            break;
        }
      };
      worker.onerror = function (e) {
        shutdown();
        emit(
          "error",
          "[Worker error] " +
            ((e && e.message) ||
              "the background analysis worker crashed unexpectedly"),
        );
      };

      var handle = {
        engine: engine,
        onStarted: function (cb) {
          listeners.started.push(cb);
        },
        onData: function (cb) {
          listeners.data.push(cb);
        },
        onEnd: function (cb) {
          listeners.end.push(cb);
        },
        onError: function (cb) {
          listeners.error.push(cb);
        },
        sendInput: function (data) {
          self.syncMessage.writeMessage(channel, { data: data });
        },
        sendEof: function () {
          self.syncMessage.writeMessage(channel, { eof: true });
        },
        kill: function () {
          if (!alive) return;
          shutdown();
          emit("end", -1);
        },
      };

      _shareFilesPromise.then(function (shareFiles) {
        if (!alive) return; // killed while share.json was loading
        worker.postMessage({
          type: "start",
          id: id,
          engine: engine,
          options: options || [],
          code: _code,
          config: _config,
          codeFile: _codeFile,
          extraFiles: _extraFiles,
          shareFiles: shareFiles,
          stdinChannel: channel,
        });
      });

      return handle;
    },

    // ── Code / config helpers (synchronous, main-thread state) ────────────

    setCode: function (code) {
      _code = code;
    },
    getCode: function () {
      return _code;
    },
    setConfig: function (config) {
      _config = config;
    },
    getConfig: function () {
      return _config;
    },

    // ── Generic virtual-filesystem helpers ────────────────────────────────

    writeFile: function (path, content) {
      if (path === _codeFile) {
        _code = content;
        return;
      }
      if (path === "/config.json") {
        _config = content;
        return;
      }
      _extraFiles[path] = content;
    },

    readFile: function (path) {
      if (path === _codeFile) return _code;
      if (path === "/config.json") return _config;
      return _extraFiles[path] || "";
    },

    deleteFile: function (path) {
      delete _extraFiles[path];
    },

    listDir: function (dir) {
      var prefix = dir === "/" ? "/" : dir + "/";
      var names = [];
      if (_codeFile.startsWith(prefix)) {
        names.push(_codeFile.replace(prefix, "").split("/")[0]);
      }
      Object.keys(_extraFiles).forEach(function (p) {
        if (p.startsWith(prefix)) {
          names.push(p.replace(prefix, "").split("/")[0]);
        }
      });
      names = names.filter(function (v, i, a) {
        return a.indexOf(v) === i;
      });
      return [names.length].concat(names);
    },

    changeCodeFilePath: function (path) {
      _codeFile = path;
    },
    getCodeFilePath: function () {
      return [0, _codeFile];
    },
  };

  console.log("[Mopsa jsoo] mopsaJs API ready");
})();
