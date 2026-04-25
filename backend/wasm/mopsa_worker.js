/**
 * mopsa_worker.js
 *
 * Web Worker that executes the Mopsa WASM analysis in a background thread
 * so the main UI thread stays responsive during analysis.
 *
 * The WASM binary (15 MB) and data file (12.6 MB) are fetched ONCE when the
 * worker starts. Each analysis re-instantiates the cached WebAssembly.Module
 * (fast, no network) because the OCaml runtime cannot be re-entered.
 *
 * Protocol
 * ────────
 * Receives: { type: 'analyze', id, options, code, config, codeFile, extraFiles }
 * Posts:    { type: 'result',  id, output }
 */
"use strict";

importScripts("./ocamlrun.js");

var _wasmModulePromise = (
  typeof WebAssembly.compileStreaming === "function"
    ? WebAssembly.compileStreaming(fetch("./ocamlrun.wasm"))
    : fetch("./ocamlrun.wasm")
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (bytes) { return WebAssembly.compile(bytes); })
).catch(function (e) {
  console.error("[Mopsa Worker] WASM pre-compilation failed:", e);
  return null;
});

var _dataBufferPromise = fetch("./ocamlrun.data")
  .then(function (r) { return r.arrayBuffer(); })
  .catch(function (e) {
    console.error("[Mopsa Worker] Data file pre-fetch failed:", e);
    return null;
  });

self.onmessage = function (event) {
  var msg = event.data;
  if (msg.type !== "analyze") return;

  var id         = msg.id;
  var options    = msg.options    || [];
  var code       = msg.code;
  var config     = msg.config;
  var codeFile   = msg.codeFile;
  var extraFiles = msg.extraFiles || {};

  var output = "";

  var isHelp = options.indexOf("-help") !== -1;

  var args = [
    "build/mopsa.bc",
  ].concat(isHelp ? [] : ["-config", "/config.json"]).concat([
    "-share-dir", "/share/mopsa",
    "-I", "/clang-headers",
    "-I", "/usr/include",
  ]).concat(options);

  Promise.all([_wasmModulePromise, _dataBufferPromise]).then(function (results) {
    var wasmModule = results[0];
    var dataBuffer = results[1];

    var moduleConfig = {
      arguments: args,

      print:    function (line) { output += line + "\n"; },
      printErr: function (line) { output += line + "\n"; },

      preRun: [function (M) {
        M.FS.writeFile("/config.json", config);

        var dir = codeFile.substring(0, codeFile.lastIndexOf("/"));
        if (dir && dir !== "/") {
          try { M.FS.mkdirTree(dir); } catch (_) {}
        }

        Object.keys(extraFiles).forEach(function (path) {
          var d = path.substring(0, path.lastIndexOf("/"));
          if (d && d !== "/") {
            try { M.FS.mkdirTree(d); } catch (_) {}
          }
          M.FS.writeFile(path, extraFiles[path]);
        });

        // Write code file LAST so it always overrides any stale extraFiles entry.
        M.FS.writeFile(codeFile, code);
      }],
    };

    if (wasmModule) {
      moduleConfig.instantiateWasm = function (imports, successCallback) {
        WebAssembly.instantiate(wasmModule, imports)
          .then(function (instance) { successCallback(instance, wasmModule); })
          .catch(function (e) {
            self.postMessage({
              type: "result", id: id,
              output: output + "\n[WASM instantiation error] " + (e && e.message || e),
            });
          });
        return {};
      };
    }

    if (dataBuffer) {
      moduleConfig.getPreloadedPackage = function (_name, _size) {
        return dataBuffer;
      };
    }

    createMopsaModule(moduleConfig)
      .then(function () {
        self.postMessage({ type: "result", id: id, output: output });
      })
      .catch(function (e) {
        if (e && typeof e === "object" && "status" in e) {
          // Normal OCaml exit() output is already captured.
          self.postMessage({ type: "result", id: id, output: output });
        } else {
          self.postMessage({
            type: "result", id: id,
            output: output + "\n[WASM error] " + (e && e.message || e),
          });
        }
      });
  });
};

console.log("[Mopsa Worker] ready");
