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
  var _codeFile   = "/code.c";
  var _code       = "int main() { return 0; }\n";   // default Universal snippet
  var _config     = CONFIG_UNI;
  var _extraFiles = {};                              // path → content

  // ── Worker setup ─────────────────────────────────────────────────────────
  var _worker  = new Worker("./mopsa_worker.js");
  var _pending = {};   // id → resolve function
  var _nextId  = 0;

  _worker.onmessage = function (event) {
    var msg = event.data;
    if (msg.type === "result" && _pending[msg.id]) {
      var resolve = _pending[msg.id];
      delete _pending[msg.id];
      resolve(msg.output);
    }
  };

  _worker.onerror = function (e) {
    console.error("[Mopsa] Worker error:", e);
    Object.keys(_pending).forEach(function (id) {
      _pending[id]("[Worker error] " + (e && e.message || e));
      delete _pending[id];
    });
  };

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
          type:       "analyze",
          id:         id,
          options:    options || [],
          code:       _code,
          config:     _config,
          codeFile:   _codeFile,
          extraFiles: _extraFiles,
        });
      });
    },

    // ── Code / config helpers (synchronous, no WASM needed) ───────────────

    setCode:   function (code)   { _code   = code;   },
    getCode:   function ()       { return _code;     },
    setConfig: function (config) { _config = config; },
    getConfig: function ()       { return _config;   },

    // ── Generic virtual-filesystem helpers ────────────────────────────────
    // Backed by plain JS objects so they work before / between analyses.

    writeFile: function (path, content) {
      if (path === _codeFile)      { _code   = content; return; }
      if (path === "/config.json") { _config = content; return; }
      _extraFiles[path] = content;
    },

    readFile: function (path) {
      if (path === _codeFile)      return _code;
      if (path === "/config.json") return _config;
      return _extraFiles[path] || "";
    },

    deleteFile: function (path) {
      delete _extraFiles[path];
    },

    listDir: function (dir) {
      var prefix = dir === "/" ? "/" : dir + "/";
      var names  = [];
      if (_codeFile.startsWith(prefix)) {
        names.push(_codeFile.replace(prefix, "").split("/")[0]);
      }
      Object.keys(_extraFiles).forEach(function (p) {
        if (p.startsWith(prefix)) {
          names.push(p.replace(prefix, "").split("/")[0]);
        }
      });
      names = names.filter(function (v, i, a) { return a.indexOf(v) === i; });
      return [names.length].concat(names);
    },

    changeCodeFilePath: function (path) { _codeFile = path; },
    getCodeFilePath:    function ()     { return [0, _codeFile]; },
  };

  console.log("[Mopsa WASM] mopsaJs API ready");
})();
