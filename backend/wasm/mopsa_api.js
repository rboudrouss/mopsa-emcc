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
    var emsg = "[Worker error] " + ((e && e.message) || e);
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
     * analyze(options: string[]) → Promise<string>
     *
     * Sends the current code/config/files to the Web Worker, which
     * instantiates a fresh WASM module, runs the Mopsa CLI, and posts back
     * the captured output.
     */
    analyze: function (options) {
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
