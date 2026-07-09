// Mopsa cross-backend performance benchmark orchestrator.
//
// Targets (backend × environment):
//   native        – host `mopsa` binary (opam switch)         [c, python, universal]
//   wasm-node     – ocamlrun.wasm driven in node              [c, python, universal]
//   wasm-browser  – ocamlrun.wasm in headless Chromium        [c, python, universal]
//   jsoo-node     – js_of_ocaml worker bundle in node         [python, universal]
//   jsoo-browser  – js_of_ocaml worker in headless Chromium   [python, universal]
//
// For each (target, file) it runs --reps analyses and records:
//   analysisMs  – Mopsa's own reported analysis time  (pure, backend-comparable)
//   runMs       – the analyze() call itself           (excl. process/module boot)
//   loadMs      – module/bundle instantiation         (per-process for node)
//   totalWallMs – full process wall clock             (native/node only)
//   peakRssMB   – peak memory                          (native via GNU time, node via rusage)
//
// Usage:
//   node run.mjs [--targets a,b,c] [--reps N] [--out results/run.json]
//   BENCH_CORPUS=universal node run.mjs        # restrict corpus by lang/id
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  BENCH_DIR, CACHE_DIR, RESULTS_DIR, JSOO_BUNDLE, WASM_GLUE, WASM_BINARY,
  WASM_DATA, NATIVE_MOPSA, loadConfig, nativeConfigName,
} from "./lib/paths.mjs";
import { loadCorpus } from "./lib/corpus.mjs";
import { runProcess, parseChildResult } from "./lib/spawn.mjs";
import { parseAnalysisMs, parseChecks, analysisStatus, aggregate, median } from "./lib/metrics.mjs";
import { writeReports } from "./report.mjs";

const ALL_TARGETS = ["native", "wasm-node", "jsoo-node", "wasm-browser", "jsoo-browser"];

// ── CLI ───────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = { targets: ALL_TARGETS, reps: 3, out: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--targets") o.targets = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--reps") o.reps = parseInt(argv[++i], 10);
    else if (a === "--out") o.out = argv[++i];
    else if (a === "--help" || a === "-h") o.help = true;
    else console.error(`unknown arg: ${a}`);
  }
  return o;
}

const opts = parseArgs(process.argv);
if (opts.help) {
  console.log(
    `Targets: ${ALL_TARGETS.join(", ")}\n` +
      `  node run.mjs [--targets a,b] [--reps N] [--out file.json]\n` +
      `  BENCH_CORPUS=universal|python|c|<id> to restrict the corpus.`,
  );
  process.exit(0);
}

// ── capability + availability ───────────────────────────────────────────────
const backendOf = (t) => (t.startsWith("wasm") ? "wasm" : t.startsWith("jsoo") ? "jsoo" : "native");
const LANGS_BY_BACKEND = {
  native: new Set(["c", "python", "universal"]),
  wasm: new Set(["c", "python", "universal"]),
  jsoo: new Set(["python", "universal"]),
};

// The mopsa test files are unittest-style (test_* functions, no main). C and
// universal need -unittest or they abort ("entry function main not found") /
// analyze nothing. Python tests run at module level, so no flag.
const extraFlags = (lang) => (lang === "python" ? [] : ["-unittest"]);

async function checkAvailability(target) {
  const b = backendOf(target);
  if (b === "wasm") {
    for (const p of [WASM_GLUE, WASM_BINARY, WASM_DATA])
      if (!existsSync(p)) return `missing ${p} (run: make wasm-web-artifacts)`;
  }
  if (b === "jsoo" && !existsSync(JSOO_BUNDLE))
    return `missing ${JSOO_BUNDLE} (run: make jsoo-web)`;
  if (b === "native") {
    if (!existsSync(NATIVE_MOPSA)) return `mopsa binary not found at ${NATIVE_MOPSA} (set MOPSA_BIN)`;
    const probe = await runProcess(NATIVE_MOPSA, ["-help"], { timeoutMs: 30000 });
    if (probe.spawnError || /error while loading shared libraries/.test(probe.stderr))
      return `mopsa binary not runnable: ${(probe.stderr.split("\n")[0] || probe.spawnError || "").trim()}`;
  }
  if (target.endsWith("browser")) {
    try {
      await import("playwright");
    } catch {
      return "playwright not installed (cd bench && npm install && npx playwright install chromium)";
    }
  }
  return null;
}

// ── per-rep record → normalized metrics ─────────────────────────────────────
function normalize({ output, runMs, loadMs, totalWallMs, peakRssMB }) {
  return {
    analysisMs: parseAnalysisMs(output),
    runMs: runMs ?? null,
    loadMs: loadMs ?? null,
    totalWallMs: totalWallMs ?? null,
    peakRssMB: peakRssMB ?? null,
    status: analysisStatus(output),
    checks: parseChecks(output),
  };
}

// ── node / native single run ────────────────────────────────────────────────
async function runNativeOnce(entry) {
  const r = await runProcess(
    NATIVE_MOPSA,
    [`-config=${nativeConfigName(entry.lang)}`, ...extraFlags(entry.lang), entry.abs],
    { sampleRss: true, timeoutMs: 300000 },
  );
  const output = r.stdout + r.stderr;
  const rec = normalize({
    output,
    // Native has no separable "module load" step: the analyze IS the run, so
    // use Mopsa's own reported analysis time as the comparable run metric.
    runMs: parseAnalysisMs(output),
    totalWallMs: r.wallMs,
    peakRssMB: r.rssKb ? r.rssKb / 1024 : null,
  });
  if (r.timedOut) return { failed: true, error: "timeout", ...rec };
  return rec;
}

// wasm-node: ONE process runs `iters` analyses over a shared compiled Module so
// V8 tiers the wasm up — iter 0 is cold, the rest warm. Returns an aggregated
// row directly (cold vs warm), not a per-rep list.
async function runWasmNodeWarm(entry, warmSamples) {
  const config = loadConfig(entry.lang);
  const iters = warmSamples + 1; // 1 cold + N warm
  const jobPath = join(CACHE_DIR, "job-wasm-node.json");
  writeFileSync(
    jobPath,
    JSON.stringify({
      config,
      iters,
      files: [{ path: entry.vfsPath, content: entry.code }],
      options: [...extraFlags(entry.lang), entry.vfsPath],
    }),
  );
  const r = await runProcess(
    process.execPath,
    [join(BENCH_DIR, "children", "wasm-node.child.mjs"), jobPath],
    { timeoutMs: 600000 },
  );
  const child = parseChildResult(r.stdout);
  if (!child || !child.runs) {
    return { failed: true, error: (r.stderr || r.stdout || "no result").slice(0, 300), status: "error", reps: 1, okReps: 0 };
  }
  const base = normalize({ output: child.output, peakRssMB: child.peakRssMB });
  const cold = child.runs[0] ?? null;
  const warm = child.runs.length > 1 ? median(child.runs.slice(1)) : null;
  return {
    ...base,
    reps: iters, okReps: iters,
    loadMs: child.loads[0] ?? null,
    runColdMs: cold,
    runWarmMs: warm,
    runMs: warm ?? cold, // primary = steady-state when available
    totalWallMs: (child.loads[0] ?? 0) + (cold ?? 0), // cold start → first result
  };
}

// jsoo-node: OCaml runtime state persists across runs (the browser respawns the
// worker for that reason), so we cannot warm in-process — one cold run per
// process, aggregated over reps by the caller.
async function runJsooNodeOnce(entry) {
  const config = loadConfig(entry.lang);
  const jobPath = join(CACHE_DIR, "job-jsoo-node.json");
  writeFileSync(
    jobPath,
    JSON.stringify({
      bundle: join(CACHE_DIR, "mopsa_worker_jsoo.cjs"),
      config,
      code: entry.code,
      vfsPath: entry.vfsPath,
      options: [...extraFlags(entry.lang), entry.vfsPath],
      extraFiles: {},
    }),
  );
  const r = await runProcess(
    process.execPath,
    [join(BENCH_DIR, "children", "jsoo-node.child.cjs"), jobPath],
    { timeoutMs: 300000 },
  );
  const child = parseChildResult(r.stdout);
  if (!child) {
    return { failed: true, error: (r.stderr || r.stdout || "no result").slice(0, 300), status: "error" };
  }
  const rec = normalize({
    output: child.output,
    runMs: child.runMs,
    loadMs: child.loadMs,
    totalWallMs: r.wallMs,
    peakRssMB: child.peakRssMB,
  });
  if (r.timedOut) return { failed: true, error: "timeout", ...rec };
  return rec;
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(RESULTS_DIR, { recursive: true });
  const corpus = loadCorpus();

  // Prepare a CJS copy of the jsoo bundle (frontend/ is "type":"module").
  if (opts.targets.some((t) => t.startsWith("jsoo")) && existsSync(JSOO_BUNDLE)) {
    // Source is read-only; write (not copyFile) so a stale read-only copy is overwritten.
    writeFileSync(join(CACHE_DIR, "mopsa_worker_jsoo.cjs"), readFileSync(JSOO_BUNDLE));
  }

  const availability = {};
  for (const t of opts.targets) availability[t] = await checkAvailability(t);

  const results = []; // { target, entry, agg }
  const browserPlan = [];

  for (const target of opts.targets) {
    if (availability[target]) {
      console.error(`⚠ ${target}: SKIPPED — ${availability[target]}`);
      continue;
    }
    const b = backendOf(target);
    const applicable = corpus.filter((e) => LANGS_BY_BACKEND[b].has(e.lang));

    if (target.endsWith("browser")) {
      for (const e of applicable)
        browserPlan.push({
          backend: b, entry: e, config: loadConfig(e.lang),
          options: [...extraFlags(e.lang), e.vfsPath], reps: opts.reps,
        });
      continue;
    }

    const how = target === "wasm-node"
      ? `1 cold + ${opts.reps} warm (même process)`
      : `${opts.reps} reps (process/rep, à froid)`;
    console.error(`▶ ${target}: ${applicable.length} files × ${how}`);
    for (const entry of applicable) {
      let agg;
      if (target === "wasm-node") {
        agg = await runWasmNodeWarm(entry, opts.reps);
      } else {
        const reps = [];
        for (let r = 0; r < opts.reps; r++) {
          reps.push(target === "native" ? await runNativeOnce(entry) : await runJsooNodeOnce(entry));
        }
        agg = aggregate(reps);
      }
      results.push({ target, entry, agg });
      const cold = agg.runColdMs != null ? `${agg.runColdMs.toFixed(0)}ms` : agg.status;
      const warm = agg.runWarmMs != null ? ` → ${agg.runWarmMs.toFixed(0)}ms chaud` : "";
      console.error(`   ${entry.id.padEnd(28)} ${cold}${warm}${agg.okReps < agg.reps ? " ⚠" : ""}`);
    }
  }

  // Browser targets run together (one server + browser boot). Per file: the
  // first analyze is cold, the rest warm (wasm tiers up on the persistent page).
  if (browserPlan.length) {
    const { runBrowser } = await import("./runners/browser.mjs");
    const byKey = new Map(); // `${target}||${id}` → { entry, cold[], warm[] }
    console.error(`▶ browser: ${browserPlan.length} (target,file) pairs × 1 cold + ${opts.reps} warm`);
    await runBrowser(browserPlan, {
      reps: opts.reps,
      onRecord: ({ target, entry, phase, record }) => {
        const key = `${target}||${entry.id}`;
        if (!byKey.has(key)) byKey.set(key, { entry, cold: [], warm: [] });
        byKey.get(key)[phase].push(record.failed ? record : normalize(record));
      },
    });
    for (const [key, { entry, cold, warm }] of byKey) {
      const target = key.split("||")[0];
      const w = aggregate(warm.length ? warm : cold);
      const c = aggregate(cold.length ? cold : warm);
      results.push({
        target, entry,
        agg: {
          ...w,
          runColdMs: c.runMs,
          runWarmMs: warm.length ? w.runMs : null,
          runMs: warm.length ? w.runMs : c.runMs,
          loadMs: c.loadMs ?? w.loadMs,
        },
      });
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    reps: opts.reps,
    targets: opts.targets,
    availability,
    corpus: corpus.map((e) => ({ id: e.id, lang: e.lang, lines: e.lines, bytes: e.bytes })),
    rows: results.map((r) => ({
      target: r.target,
      backend: backendOf(r.target),
      env: r.target.endsWith("browser") ? "browser" : "node/native",
      id: r.entry.id,
      lang: r.entry.lang,
      lines: r.entry.lines,
      ...r.agg,
    })),
  };

  const outJson = opts.out || join(RESULTS_DIR, "latest.json");
  writeFileSync(outJson, JSON.stringify(payload, null, 2));
  const { mdPath, csvPath } = writeReports(payload, outJson);
  console.error(`\n✔ Wrote:\n  ${outJson}\n  ${mdPath}\n  ${csvPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
