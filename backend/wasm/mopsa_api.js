/**
 * mopsa_api.js
 *
 * Sets up window.mopsaJs synchronously so it is ready before the React
 * bundle executes.  Must be loaded AFTER ocamlrun.js (which defines the
 * createMopsaModule factory) in index.html.
 *
 * Design
 * ──────
 * Code, config, and extra files are kept in plain JS variables.  When the
 * user clicks Run, analyze() calls createMopsaModule() with a fresh WASM
 * instance, writes the current code / config into that instance's virtual
 * filesystem via preRun, passes the right CLI arguments, captures stdout,
 * and resolves the returned Promise with the captured output.
 *
 * This avoids Asyncify (incompatible with OCaml's setjmp/longjmp) and the
 * need to ever reuse a WASM instance (OCaml runtime cannot be re-entered).
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
  var _codeFile  = "/code.u";
  var _code      = "let () = ()\n";    // default Universal snippet
  var _config    = CONFIG_UNI;
  var _extraFiles = {};                // path → content for any extra files

  // ── Public API ───────────────────────────────────────────────────────────
  window.mopsaJs = {

    configUni: CONFIG_UNI,

    /**
     * analyze(options: string[]) → Promise<string>
     *
     * Creates a fresh WASM instance, writes code + config into its VFS,
     * runs the Mopsa CLI, and resolves with the captured output.
     *
     * CLI invocation inside WASM:
     *   mopsa -config /config.json [-share-dir /share/mopsa] <codeFile>
     */
    analyze: function (options) {
      return new Promise(function (resolve) {
        var output   = "";
        var codeFile = _codeFile;
        var code     = _code;
        var config   = _config;

        var args = [
          "build/mopsa.bc",
          "-config", "/config.json",
          "-share-dir", "/share/mopsa",
        ].concat(options || []).concat([codeFile]);

        createMopsaModule({
          arguments: args,

          print: function (line) { output += line + "\n"; },
          printErr: function (line) { output += line + "\n"; },

          preRun: [function (M) {
            // Write config
            M.FS.writeFile("/config.json", config);

            // Ensure the directory for the code file exists
            var dir = codeFile.substring(0, codeFile.lastIndexOf("/"));
            if (dir && dir !== "/") {
              try { M.FS.mkdirTree(dir); } catch (_) {}
            }
            M.FS.writeFile(codeFile, code);

            // Write any extra files the user created via writeFile
            Object.keys(_extraFiles).forEach(function (path) {
              var d = path.substring(0, path.lastIndexOf("/"));
              if (d && d !== "/") {
                try { M.FS.mkdirTree(d); } catch (_) {}
              }
              M.FS.writeFile(path, _extraFiles[path]);
            });
          }],
        })
          .then(function () { resolve(output); })
          .catch(function (e) {
            // OCaml calls exit() which Emscripten surfaces as an ExitStatus
            // object or a plain rejection — the output is already captured.
            if (e && typeof e === "object" && "status" in e) {
              resolve(output); // normal exit
            } else {
              resolve(output + "\n[WASM error] " + (e && e.message || e));
            }
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
      if (path === _codeFile)    { _code   = content; return; }
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
      // include the current code file if it lives under dir
      if (_codeFile.startsWith(prefix)) {
        names.push(_codeFile.replace(prefix, "").split("/")[0]);
      }
      Object.keys(_extraFiles).forEach(function (p) {
        if (p.startsWith(prefix)) {
          names.push(p.replace(prefix, "").split("/")[0]);
        }
      });
      // deduplicate
      names = names.filter(function (v, i, a) { return a.indexOf(v) === i; });
      return [names.length].concat(names);
    },

    changeCodeFilePath: function (path) { _codeFile = path; },
    getCodeFilePath:    function ()     { return [0, _codeFile]; },
  };

  console.log("[Mopsa WASM] mopsaJs API ready");
})();
