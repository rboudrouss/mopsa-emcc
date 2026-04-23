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
 * user clicks Run, analyze() re-instantiates a pre-compiled WASM module,
 * writes the current code / config into that instance's virtual filesystem
 * via preRun, passes the right CLI arguments, captures stdout, and resolves
 * the returned Promise with the captured output.
 *
 * The WASM binary (241 MB) and data file (12.6 MB) are fetched ONCE at page
 * load.  Each analyze() call re-instantiates the cached WebAssembly.Module
 * (fast, no network) and provides the cached data buffer via getPreloadedPackage
 * so Emscripten skips the data fetch too.
 *
 * This avoids Asyncify (incompatible with OCaml's setjmp/longjmp) and the
 * need to ever reuse a WASM instance (OCaml runtime cannot be re-entered).
 */
(function () {
  "use strict";

  // ── Pre-fetch WASM binary and data file once at load time ─────────────────
  var _wasmModulePromise = (
    typeof WebAssembly.compileStreaming === "function"
      ? WebAssembly.compileStreaming(fetch("./ocamlrun.wasm"))
      : fetch("./ocamlrun.wasm")
          .then(function (r) { return r.arrayBuffer(); })
          .then(function (bytes) { return WebAssembly.compile(bytes); })
  ).catch(function (e) {
    console.error("[Mopsa WASM] Pre-compilation failed, will re-download on demand:", e);
    return null;
  });

  var _dataBufferPromise = fetch("./ocamlrun.data")
    .then(function (r) { return r.arrayBuffer(); })
    .catch(function (e) {
      console.error("[Mopsa WASM] Pre-fetch of data file failed, will re-download on demand:", e);
      return null;
    });

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
  var _code      = "int main() { return 0; }\n";    // default Universal snippet
  var _config    = CONFIG_UNI;
  var _extraFiles = {};                // path → content for any extra files

  // ── Public API ───────────────────────────────────────────────────────────
  window.mopsaJs = {

    configUni: CONFIG_UNI,

    /**
     * analyze(options: string[]) → Promise<string>
     *
     * Re-instantiates the pre-compiled WASM module, writes code + config into
     * its VFS, runs the Mopsa CLI, and resolves with the captured output.
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
          "-I", "/clang-headers",
          "-I", "/usr/include",
        ].concat(options || []).concat([codeFile]);

        Promise.all([_wasmModulePromise, _dataBufferPromise]).then(function (results) {
          var wasmModule = results[0];
          var dataBuffer = results[1];

          var moduleConfig = {
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
              // Write any extra files the user created via writeFile
              Object.keys(_extraFiles).forEach(function (path) {
                var d = path.substring(0, path.lastIndexOf("/"));
                if (d && d !== "/") {
                  try { M.FS.mkdirTree(d); } catch (_) {}
                }
                M.FS.writeFile(path, _extraFiles[path]);
              });

              // Write code file LAST so it always overrides any stale _extraFiles
              // entry (moveFile puts old content into _extraFiles[newPath] during
              // language changes, which would otherwise silently overwrite _code).
              M.FS.writeFile(codeFile, code);
            }],
          };

          // Skip re-downloading/re-compiling the 241 MB WASM binary.
          if (wasmModule) {
            moduleConfig.instantiateWasm = function (imports, successCallback) {
              WebAssembly.instantiate(wasmModule, imports)
                .then(function (instance) { successCallback(instance, wasmModule); })
                .catch(function (e) {
                  resolve(output + "\n[WASM instantiation error] " + (e && e.message || e));
                });
              return {}; // signals async instantiation to Emscripten
            };
          }

          // Skip re-downloading the 12.6 MB data file.
          if (dataBuffer) {
            moduleConfig.getPreloadedPackage = function (_name, _size) {
              return dataBuffer;
            };
          }

          createMopsaModule(moduleConfig)
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
