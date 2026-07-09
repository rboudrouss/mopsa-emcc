// Parsing of Mopsa textual output + small stats helpers, shared by all runners.

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

export function stripAnsi(s) {
  return (s || "").replace(ANSI, "");
}

// Mopsa prints "Analysis time: 0.017s" — this is the analyzer's own wall time,
// independent of the surrounding JS runtime, so it is the fairest cross-backend
// "pure analysis" figure. Returns milliseconds or null.
export function parseAnalysisMs(output) {
  const m = stripAnsi(output).match(/Analysis time:\s*([\d.]+)\s*s/i);
  return m ? parseFloat(m[1]) * 1000 : null;
}

// "Checks summary: 12 total, ✔ 10 safe ... ✗ 2 error" → { total, safe, ... }.
export function parseChecks(output) {
  const clean = stripAnsi(output);
  const m = clean.match(/Checks summary:\s*(\d+)\s*total/i);
  if (!m) return null;
  const num = (re) => {
    const x = clean.match(re);
    return x ? parseInt(x[1], 10) : 0;
  };
  return {
    total: parseInt(m[1], 10),
    safe: num(/(\d+)\s*safe/i),
    error: num(/(\d+)\s*error/i),
    warning: num(/(\d+)\s*warning/i),
  };
}

export function analysisStatus(output) {
  const c = stripAnsi(output);
  if (/Analysis terminated successfully/i.test(c)) return "ok";
  if (/Analysis aborted|panic:|syntax error|\[(jsoo|WASM) error\]/i.test(c))
    return "aborted";
  return "unknown";
}

// ── aggregation ─────────────────────────────────────────────────────────────
export function median(xs) {
  const a = xs.filter((x) => x != null).slice().sort((p, q) => p - q);
  if (!a.length) return null;
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

export function mean(xs) {
  const a = xs.filter((x) => x != null);
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
}

export function min(xs) {
  const a = xs.filter((x) => x != null);
  return a.length ? Math.min(...a) : null;
}

// Reduce K per-rep records into one aggregated row (median of each metric).
export function aggregate(reps) {
  const ok = reps.filter((r) => r && !r.failed);
  const pick = (k) => median(ok.map((r) => r[k]));
  const sample = ok[0] || reps[0] || {};
  const runMs = pick("runMs");
  return {
    reps: reps.length,
    okReps: ok.length,
    analysisMs: pick("analysisMs"),
    runMs,
    // Cold/warm split. For single-run-per-process targets (native, jsoo) every
    // rep is a cold start, so cold = runMs and there is no warm measurement.
    runColdMs: pick("runColdMs") ?? runMs,
    runWarmMs: pick("runWarmMs"),
    loadMs: pick("loadMs"),
    totalWallMs: pick("totalWallMs"),
    peakRssMB: pick("peakRssMB"),
    status: sample.status || "n/a",
    checks: sample.checks || null,
    error: reps.find((r) => r && r.failed)?.error || null,
  };
}
