# Mopsa performance benchmark harness

Compares Mopsa analysis performance across every backend × environment:

| target          | backend | env     | languages           |
| --------------- | ------- | ------- | ------------------- |
| `native`        | native  | host    | c, python, universal |
| `wasm-node`     | wasm    | Node.js | c, python, universal |
| `wasm-browser`  | wasm    | Chromium| c, python, universal |
| `jsoo-node`     | jsoo    | Node.js | python, universal    |
| `jsoo-browser`  | jsoo    | Chromium| python, universal    |

The corpus is a set of files from `deps/mopsa-analyzer/analyzer/tests`
(`bench/lib/corpus.mjs`). jsoo has no C frontend, so C files are skipped for it.

## Prerequisites

- Built artifacts:
  - wasm: `make wasm-web-artifacts` → `dist/ocamlrun.{js,wasm,data}`
  - jsoo: `make jsoo-web` → `frontend/public/mopsa_worker_jsoo.js` + `share.json`
- Frontend deps installed (`frontend/node_modules`, for the browser dev server).
- **Browser targets** need Playwright:
  ```sh
  cd bench && npm install && npx playwright install chromium
  ```
- **Native target** needs a runnable `mopsa` binary (host opam switch). Point at
  it with `MOPSA_BIN=/path/to/mopsa` if it is not at `~/.opam/4.14.2/bin/mopsa`.

## Usage

```sh
cd bench

node run.mjs                                  # all 5 targets, 3 reps
node run.mjs --targets wasm-node,jsoo-node    # subset
node run.mjs --reps 5 --out results/run1.json
BENCH_CORPUS=universal node run.mjs           # restrict corpus by lang / id / name

npm run bench:node       # native + wasm-node + jsoo-node
npm run bench:browser    # wasm-browser + jsoo-browser

node report.mjs results/run1.json             # re-render md + csv from a json
```

Each `run.mjs` writes three files next to `--out` (default `results/latest.*`):
`*.json` (raw), `*.md` (tables), `*.csv` (flat, one row per target×file).

## Metrics

- **run**: the analyze call with the module/runtime already loaded. **The main
  cross-backend comparison metric.**
- **analyse (Mopsa)**: Mopsa's own `Analysis time`. Meaningful for native and
  jsoo; the **wasm runtime clock is a stub and always reports `0.000s`**, so it
  is shown as `n/a` for wasm.
- **total**: full process wall-clock incl. module/runtime boot (native/node only).
- **RSS**: peak memory: native by polling `/proc/<pid>/status` VmRSS over the
  whole process subtree (the `mopsa` launcher is a bash wrapper that execs
  `mopsa.exe`, so descendants are summed); node via
  `process.resourceUsage().maxRSS`; browser via `performance.memory` (main-thread
  heap only, approximate — the worker's memory is not counted). Sub-~10ms native
  runs (e.g. tiny universal files) finish before the 15ms sampler fires, so their
  RSS shows `y`.

Reported values are the **median** over `--reps` runs. Node/native runs use a
fresh child process per (file, rep) for clean isolation and peak-memory numbers.
In the browser the worker re-instantiates the module on every analysis (wasm) or
respawns entirely (jsoo), so **run** there includes that per-call cost.

## Layout

```
run.mjs                      orchestrator + CLI
report.mjs                   md / csv rendering
lib/paths.mjs                repo paths, config loader
lib/corpus.mjs               benchmark file set
lib/metrics.mjs              output parsing + stats
lib/spawn.mjs                child-process + GNU time helper
children/wasm-node.child.mjs one wasm analysis in a fresh node process
children/jsoo-node.child.cjs one jsoo analysis in a fresh node process
runners/browser.mjs          Playwright driver (vite dev server + Chromium)
results/                     generated reports (git-ignored)
.cache/                      job files + CJS copy of the jsoo bundle (git-ignored)
```

## Notes on the node drivers

- **wasm-node** loads the MODULARIZE'd `dist/ocamlrun.js` and supplies
  `wasmBinary` + `getPreloadedPackage` so it runs in Node without the browser's
  `fetch()`. File writes / args mirror `backend/wasm/mopsa_worker.js`.
- **jsoo-node** reuses the browser worker bundle. It is Web-Worker-shaped, so the
  driver (a) masks `process.versions.node` while the bundle initialises — forcing
  js_of_ocaml to keep its in-memory virtual FS instead of a real-fs device (else
  `Sys_js.create_file` fails with `cannot register file`) — and (b) provides a
  minimal `self` (postMessage/onmessage/importScripts). It is loaded as `.cjs`
  because `frontend/` is an ESM package.
