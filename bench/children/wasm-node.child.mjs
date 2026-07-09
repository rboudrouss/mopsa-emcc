// One or more WASM analyses in a single node process (spawned by run.mjs).
// The WebAssembly.Module is compiled ONCE and shared across iterations (each
// createMopsaModule builds a fresh instance, as the browser worker does), so V8
// can tier the wasm up from Liftoff to TurboFan: iteration 0 is a cold start,
// later iterations are warm/steady-state — the apples-to-apples match for the
// persistent browser instance. Mirrors backend/wasm/mopsa_worker.js
// (buildArgs + makePreRun); wasmBinary/getPreloadedPackage bypass fetch().
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { WASM_GLUE, WASM_BINARY, WASM_DATA, REPO_DIR } from "../lib/paths.mjs";

const job = JSON.parse(readFileSync(process.argv[2], "utf8"));
const iters = Math.max(1, job.iters || 1);
const require = createRequire(REPO_DIR + "/");
const createMopsaModule = require(WASM_GLUE);
const wasmBinary = readFileSync(WASM_BINARY);
const dataBuf = readFileSync(WASM_DATA);
const dataAB = dataBuf.buffer.slice(
  dataBuf.byteOffset,
  dataBuf.byteOffset + dataBuf.byteLength,
);

function buildArgs(options) {
  return ["build/mopsa.bc", "-config", "/config.json"]
    .concat(["-share-dir", "/share/mopsa", "-I", "/clang-headers", "-I", "/usr/include"])
    .concat(options || []);
}

// Compile the module once so all instances share V8's tiered-up code.
const mod = await WebAssembly.compile(wasmBinary);

function runOnce() {
  return new Promise((resolve) => {
    let output = "";
    let tLoaded = null;
    const tStart = performance.now();
    createMopsaModule({
      arguments: buildArgs(job.options),
      print: (l) => (output += l + "\n"),
      printErr: (l) => (output += l + "\n"),
      instantiateWasm: (imports, cb) => {
        WebAssembly.instantiate(mod, imports).then((inst) => cb(inst, mod));
        return {};
      },
      getPreloadedPackage: () => dataAB,
      locateFile: (p) => p,
      onRuntimeInitialized: () => (tLoaded = performance.now()),
      preRun: [
        (M) => {
          if (M.ENV) M.ENV.TERM = "xterm-256color";
          M.FS.writeFile("/config.json", job.config);
          for (const f of job.files) {
            const dir = f.path.slice(0, f.path.lastIndexOf("/"));
            if (dir && dir !== "/") {
              try {
                M.FS.mkdirTree(dir);
              } catch {
                /* exists */
              }
            }
            M.FS.writeFile(f.path, f.content);
          }
        },
      ],
    })
      .then(() => finish())
      .catch((e) => {
        if (!(e && typeof e === "object" && "status" in e))
          output += "\n[WASM error] " + ((e && e.message) || e) + "\n";
        finish();
      });
    function finish() {
      const tEnd = performance.now();
      resolve({
        loadMs: tLoaded ? tLoaded - tStart : null,
        runMs: tLoaded ? tEnd - tLoaded : tEnd - tStart,
        output,
      });
    }
  });
}

const runs = [];
const loads = [];
let output = "";
for (let i = 0; i < iters; i++) {
  const r = await runOnce();
  runs.push(r.runMs);
  loads.push(r.loadMs);
  output = r.output; // keep the last iteration's output
}

process.stdout.write(
  "__BENCH_RESULT__" +
    JSON.stringify({
      runs,
      loads,
      peakRssMB: process.resourceUsage().maxRSS / 1024,
      output,
    }),
);
