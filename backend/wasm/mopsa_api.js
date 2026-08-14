/**
 * mopsa_api.js
 *
 * Sets up window.mopsaJs synchronously so it is ready before the React
 * bundle executes.  Must be loaded in index.html BEFORE the React bundle.
 *
 * Design
 * ──────
 * Code, config, and extra files are kept in plain JS variables in the main
 * thread (synchronous, instant).  When the user clicks Run, analyze() sends
 * the current state to a persistent Web Worker (mopsa_worker.js) via
 * postMessage and resolves the returned Promise when the worker replies.
 *
 * The Worker owns the WASM binary (15 MB) and data file (23 MB) — it
 * fetches them once at startup and re-instantiates the cached
 * WebAssembly.Module for each analysis call (OCaml runtime cannot be
 * re-entered, so a fresh instance is needed every time).
 *
 * This keeps the main thread fully responsive during analysis.
 */
(function () {
  "use strict";

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
  var _code = "int main() { return 0; }\n"; // default Universal snippet
  var _config = CONFIG_UNI;
  var _extraFiles = {}; // path → content

  // ── Worker setup ─────────────────────────────────────────────────────────
  var _worker = null;
  var _pending = {}; // id → resolve function (batch analyses)
  var _nextId = 0;
  var _session = null; // active interactive/dap session handle, or null

  function _handleMessage(event) {
    var msg = event.data;
    if (!msg) return;
    switch (msg.type) {
      case "result": // batch analysis finished
        if (_pending[msg.id]) {
          var resolve = _pending[msg.id];
          delete _pending[msg.id];
          resolve(msg.output);
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
          ended._emit("end", msg.code);
        }
        break;
      case "session-error":
        if (_session && _session._id === msg.id) {
          var errored = _session;
          _session = null;
          errored._emit("error", msg.message);
        }
        break;
    }
  }

  function _handleError(e) {
    console.error("[Mopsa] Worker error:", e);
    // ErrorEvent.message is often empty (e.g. worker crash) and
    // String(event) is "[object Event]". Give something readable instead.
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

  // Settle every queued/in-flight batch analysis as superseded. Resolving with
  // null (rather than rejecting) keeps these off the error path: analyzeJson
  // maps null straight through and useAnalysis skips it, so the last good
  // result stays on screen until the newest analysis completes.
  function _cancelPendingBatches() {
    Object.keys(_pending).forEach(function (id) {
      var resolve = _pending[id];
      delete _pending[id];
      resolve(null);
    });
  }

  function _spawnWorker() {
    _worker = new Worker("./mopsa_worker.js");
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
     * Sends the current code/config/files to the Web Worker, which
     * instantiates a fresh WASM module, runs the Mopsa CLI, and posts back
     * the captured output.
     *
     * Auto-analysis fires a fresh run on every edit, but a C+Python batch can
     * take ~20s and the worker runs WASM synchronously — it ignores postMessage
     * mid-run, so queued analyses would otherwise pile up and run one after the
     * other. So a new analyze() supersedes any in-flight/queued one: the stale
     * runs resolve with null (the React layer ignores a null result and keeps
     * the previous output) and we terminate + respawn the worker — the same
     * interrupt sessions use, since a blocked worker can't be cancelled
     * otherwise. Only the latest request ever produces a real result.
     */
    analyze: function (options) {
      if (!_session && Object.keys(_pending).length > 0) {
        _cancelPendingBatches();
        _worker.terminate();
        _spawnWorker();
      }
      return new Promise(function (resolve) {
        var id = _nextId++;
        _pending[id] = resolve;
        _worker.postMessage({
          type: "analyze",
          id: id,
          options: options || [],
          code: _code,
          config: _config,
          codeFile: _codeFile,
          extraFiles: _extraFiles,
        });
      });
    },

    /**
     * startSession(engine, options) → SessionHandle
     *
     * Begin a long-lived interactive ('interactive') or debugger ('dap')
     * run. stdin is fed synchronously over a SharedArrayBuffer channel
     * (requires cross-origin isolation); stdout/stderr stream back as raw
     * bytes. Only one session may run at a time (it monopolises the worker).
     *
     * Do NOT include -engine in `options`; the worker appends it from `engine`.
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
          // The worker is blocked in Atomics.wait and ignores postMessage,
          // so the only reliable interrupt is to terminate and respawn.
          _worker.terminate();
          _spawnWorker();
          if (wasActive) handle._emit("end", -1);
        },
      };
      _session = handle;

      _worker.postMessage({
        type: "start",
        id: id,
        engine: engine,
        options: options || [],
        code: _code,
        config: _config,
        codeFile: _codeFile,
        extraFiles: _extraFiles,
        stdinChannel: channel,
      });

      return handle;
    },

    /**
     * startBackgroundSession(engine, options) → SessionHandle
     *
     * Like startSession, but on its OWN dedicated Worker, so it coexists
     * with batch analyses and the foreground interactive/dap session (which
     * monopolise the shared worker). Used for long-lived auxiliary runs,
     * e.g. the editor-hover DAP session that keeps serving `environment`
     * requests after its analysis finished.
     *
     * kill() terminates the dedicated worker outright; the handle is dead
     * afterwards (start a new background session instead of reusing it).
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
      var worker = new Worker("./mopsa_worker.js");
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

      worker.postMessage({
        type: "start",
        id: id,
        engine: engine,
        options: options || [],
        code: _code,
        config: _config,
        codeFile: _codeFile,
        extraFiles: _extraFiles,
        stdinChannel: channel,
      });

      return handle;
    },

    // ── Code / config helpers (synchronous, no WASM needed) ───────────────

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
    // Backed by plain JS objects so they work before / between analyses.

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

  console.log("[Mopsa WASM] mopsaJs API ready");
})();
