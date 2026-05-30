/**
 * mopsa_worker.js
 *
 * Web Worker that executes the Mopsa WASM analysis in a background thread
 * so the main UI thread stays responsive during analysis.
 *
 * The WASM binary (15 MB) and data file (12.6 MB) are fetched ONCE when the
 * worker starts. Each run re-instantiates the cached WebAssembly.Module
 * (fast, no network) because the OCaml runtime cannot be re-entered.
 *
 * Two execution modes
 * ───────────────────
 * 1. Batch (-engine=automatic) — request/response, output buffered and
 *    returned at the end. This is the original one-shot model.
 *      Receives: { type:'analyze', id, options, code, config, codeFile, extraFiles }
 *      Posts:    { type:'result',  id, output }
 *
 * 2. Session (-engine=interactive | dap) — ONE long-lived run that blocks on
 *    synchronous stdin. stdin is fed over a SharedArrayBuffer channel
 *    (sync-message.js) via Atomics.wait, because the worker thread is frozen
 *    inside the blocking read and cannot service postMessage. stdout/stderr are
 *    streamed back as raw bytes as they are produced (the worker is never
 *    blocked on output).
 *      Receives: { type:'start', id, engine, options, code, config, codeFile,
 *                  extraFiles, stdinChannel }
 *      Posts:    { type:'started',      id }
 *                { type:'stdout-bytes', id, bytes }      // raw, transferable
 *                { type:'session-ended', id, code }
 *                { type:'session-error', id, message }
 *
 * A session cannot be interrupted via postMessage (the thread is blocked in
 * Atomics.wait); the main thread kills it with worker.terminate() + respawn.
 */
"use strict";

importScripts("./ocamlrun.js", "./sync-message.js");

var _wasmModulePromise = (
  typeof WebAssembly.compileStreaming === "function"
    ? WebAssembly.compileStreaming(fetch("./ocamlrun.wasm"))
    : fetch("./ocamlrun.wasm")
        .then(function (r) {
          return r.arrayBuffer();
        })
        .then(function (bytes) {
          return WebAssembly.compile(bytes);
        })
).catch(function (e) {
  console.error("[Mopsa Worker] WASM pre-compilation failed:", e);
  return null;
});

var _dataBufferPromise = fetch("./ocamlrun.data")
  .then(function (r) {
    return r.arrayBuffer();
  })
  .catch(function (e) {
    console.error("[Mopsa Worker] Data file pre-fetch failed:", e);
    return null;
  });

// ── Shared helpers ──────────────────────────────────────────────────────────

function buildArgs(options, isHelp) {
  return ["build/mopsa.bc"]
    .concat(isHelp ? [] : ["-config", "/config.json"])
    .concat(["-share-dir", "/share/mopsa", "-I", "/clang-headers", "-I", "/usr/include"])
    .concat(options || []);
}

// Write code/config/extra files into the virtual FS, and set TERM so Mopsa
// emits ANSI colors (utils/core/debug.ml reads Sys.getenv "TERM"; the Worker
// has none by default → colorless output). Requires 'ENV' exported (Makefile).
function makePreRun(code, config, codeFile, extraFiles) {
  return function (M) {
    if (M.ENV) M.ENV.TERM = "xterm-256color";

    M.FS.writeFile("/config.json", config);

    var dir = codeFile.substring(0, codeFile.lastIndexOf("/"));
    if (dir && dir !== "/") {
      try {
        M.FS.mkdirTree(dir);
      } catch (_) {}
    }

    Object.keys(extraFiles || {}).forEach(function (path) {
      var d = path.substring(0, path.lastIndexOf("/"));
      if (d && d !== "/") {
        try {
          M.FS.mkdirTree(d);
        } catch (_) {}
      }
      M.FS.writeFile(path, extraFiles[path]);
    });

    // Write code file LAST so it always overrides any stale extraFiles entry.
    M.FS.writeFile(codeFile, code);
  };
}

function withWasm(moduleConfig, wasmModule, dataBuffer, onInstantiateError) {
  if (wasmModule) {
    moduleConfig.instantiateWasm = function (imports, successCallback) {
      WebAssembly.instantiate(wasmModule, imports)
        .then(function (instance) {
          successCallback(instance, wasmModule);
        })
        .catch(onInstantiateError);
      return {};
    };
  }
  if (dataBuffer) {
    moduleConfig.getPreloadedPackage = function () {
      return dataBuffer;
    };
  }
  return moduleConfig;
}

// ── Batch mode (-engine=automatic) ────────────────────────────────────────────

function runBatch(msg) {
  var id = msg.id;
  var options = msg.options || [];
  var output = "";
  var isHelp = options.indexOf("-help") !== -1;

  Promise.all([_wasmModulePromise, _dataBufferPromise]).then(function (results) {
    var moduleConfig = withWasm(
      {
        arguments: buildArgs(options, isHelp),
        print: function (line) {
          output += line + "\n";
        },
        printErr: function (line) {
          output += line + "\n";
        },
        preRun: [makePreRun(msg.code, msg.config, msg.codeFile, msg.extraFiles)],
      },
      results[0],
      results[1],
      function (e) {
        self.postMessage({
          type: "result",
          id: id,
          output: output + "\n[WASM instantiation error] " + ((e && e.message) || e),
        });
      },
    );

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
            type: "result",
            id: id,
            output: output + "\n[WASM error] " + ((e && e.message) || e),
          });
        }
      });
  });
}

// ── Session mode (-engine=interactive | dap) ──────────────────────────────────

// Synchronous stdin: blocks the worker thread on Atomics.wait until the main
// thread writes a message over the SAB channel. Returns one byte per call,
// or null. Emscripten's createDevice read() loops calling this until it gets
// null, so we must return null at the END of each chunk to let read() return
// (otherwise it would block waiting for a second line the user hasn't typed).
// The `delivering` flag distinguishes "just finished a chunk" (return null,
// don't block) from "start of a fresh read" (block for the next message).
//
// `flushOut` is called right before we block: while the thread sits in
// Atomics.wait, microtasks do NOT run, so any buffered stdout (e.g. the
// no-newline "mopsa >> " prompt printed just before this read) would never
// reach the main thread and the user would face a silent prompt. Flushing
// synchronously here guarantees the prompt/response is shown before we wait.
function makeStdin(channel, flushOut) {
  var buf = new Uint8Array(0);
  var pos = 0;
  var eof = false;
  var delivering = false;
  var msgId = 0;
  var encoder = new TextEncoder();
  return function () {
    if (pos < buf.length) {
      delivering = true;
      return buf[pos++];
    }
    if (eof) return null; // permanent EOF
    if (delivering) {
      delivering = false; // end of the current chunk → let read() return
      return null;
    }
    // Start of a new read: flush pending output, then block for the next chunk.
    flushOut();
    while (true) {
      var m = self.syncMessage.readMessage(channel, String(msgId++), {});
      if (m == null) continue; // defensive: only on timeout/interrupt
      if (m.eof) {
        eof = true;
        return null;
      }
      buf = encoder.encode(m.data || "");
      pos = 0;
      if (buf.length === 0) continue; // empty payload → wait for real data
      delivering = true;
      return buf[pos++];
    }
  };
}

// Raw stdout/stderr: collect bytes and post them. Batches within a synchronous
// run via a microtask, but also exposes a synchronous flush() that makeStdin
// calls before blocking. Used for BOTH engines: interactive feeds the bytes to
// xterm (no-newline prompts must stream immediately); dap reassembles
// Content-Length frames from them.
function makeByteSink(id) {
  var buf = [];
  var scheduled = false;
  function flush() {
    scheduled = false;
    if (!buf.length) return;
    var bytes = new Uint8Array(buf);
    buf = [];
    self.postMessage({ type: "stdout-bytes", id: id, bytes: bytes }, [bytes.buffer]);
  }
  var sink = function (val) {
    if (val === null) {
      flush();
      return;
    }
    buf.push(val & 0xff);
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
  };
  sink.flush = flush;
  return sink;
}

function runSession(msg) {
  var id = msg.id;
  var engine = msg.engine; // 'interactive' | 'dap'
  var channel = msg.stdinChannel;
  // Worker is authoritative for the engine flag; callers must NOT also pass it.
  var options = (msg.options || []).concat(["-engine=" + engine]);

  if (!channel) {
    self.postMessage({
      type: "session-error",
      id: id,
      message: "No stdin channel (SharedArrayBuffer unavailable?)",
    });
    return;
  }

  var sink = makeByteSink(id);

  Promise.all([_wasmModulePromise, _dataBufferPromise]).then(function (results) {
    var moduleConfig = withWasm(
      {
        arguments: buildArgs(options, false),
        stdin: makeStdin(channel, sink.flush),
        stdout: sink,
        stderr: sink,
        preRun: [makePreRun(msg.code, msg.config, msg.codeFile, msg.extraFiles)],
      },
      results[0],
      results[1],
      function (e) {
        self.postMessage({
          type: "session-error",
          id: id,
          message: "[WASM instantiation error] " + ((e && e.message) || e),
        });
      },
    );

    self.postMessage({ type: "started", id: id });

    createMopsaModule(moduleConfig)
      .then(function () {
        self.postMessage({ type: "session-ended", id: id, code: 0 });
      })
      .catch(function (e) {
        if (e && typeof e === "object" && "status" in e) {
          self.postMessage({ type: "session-ended", id: id, code: e.status });
        } else {
          self.postMessage({
            type: "session-error",
            id: id,
            message: "[WASM error] " + ((e && e.message) || e),
          });
        }
      });
  });
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

self.onmessage = function (event) {
  var msg = event.data;
  if (!msg) return;
  if (msg.type === "analyze") runBatch(msg);
  else if (msg.type === "start") runSession(msg);
  // 'kill' is unreachable while the thread is blocked in Atomics.wait; the main
  // thread kills a session with worker.terminate() + respawn instead.
};

console.log("[Mopsa Worker] ready");
