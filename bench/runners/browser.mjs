// Browser runner: drives the real frontend under headless Chromium via
// Playwright. Both backends expose the same window.mopsaJs API (set up by the
// index.html loader from localStorage 'mopsa-backend'), so we call it directly
// rather than clicking through React. The WASM/jsoo worker runs the analysis in
// a Web Worker exactly as a real user would trigger it.
//
// Requires Playwright: `cd bench && npm install && npx playwright install chromium`.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";
import { FRONTEND_PUBLIC } from "../lib/paths.mjs";
import { dirname, join } from "node:path";

const FRONTEND_DIR = dirname(FRONTEND_PUBLIC);
const PORT = Number(process.env.BENCH_PORT || 5199);
const URL = `http://localhost:${PORT}/`;

async function loadPlaywright() {
  try {
    return (await import("playwright")).chromium;
  } catch {
    throw new Error(
      "playwright not installed. Run:  cd bench && npm install && npx playwright install chromium",
    );
  }
}

async function waitForServer(proc) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(URL);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    if (proc.exitCode != null)
      throw new Error(`vite server exited early (code ${proc.exitCode})`);
    await sleep(300);
  }
  throw new Error("vite dev server did not become ready within 60s");
}

function startServer() {
  // Call the local vite binary directly (avoids pnpm, which needs Node >= 22).
  const viteBin = join(FRONTEND_DIR, "node_modules", ".bin", "vite");
  const cmd = existsSync(viteBin) ? viteBin : "vite";
  const proc = spawn(
    cmd,
    ["--port", String(PORT), "--strictPort", "--clearScreen", "false"],
    { cwd: FRONTEND_DIR, stdio: ["ignore", "pipe", "pipe"], env: process.env },
  );
  proc.stdout.on("data", () => {});
  proc.stderr.on("data", () => {});
  return proc;
}

// In-page: set the API state and run one analysis, timing the analyze() call.
async function analyzeInPage(page, entry, config, options) {
  return page.evaluate(
    async ({ code, vfsPath, config, options }) => {
      window.mopsaJs.changeCodeFilePath(vfsPath);
      window.mopsaJs.setCode(code);
      window.mopsaJs.setConfig(config);
      const t0 = performance.now();
      const raw = await window.mopsaJs.analyze(options);
      const runMs = performance.now() - t0;
      const mem =
        (performance.memory && performance.memory.usedJSHeapSize) || null;
      return { raw: raw ?? "", runMs, memBytes: mem };
    },
    { code: entry.code, vfsPath: entry.vfsPath, config, options },
  );
}

// Run all (entry, backend) pairs for the requested browser backends.
// `plan` = [{ backend:'wasm'|'jsoo', entry, config, options, reps }]
export async function runBrowser(plan, { reps, onRecord }) {
  const chromium = await loadPlaywright();
  const server = startServer();
  let browser;
  try {
    await waitForServer(server);
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--enable-precise-memory-info"],
    });

    // Group by backend so we reload the page once per backend, not per file.
    const backends = [...new Set(plan.map((p) => p.backend))];
    for (const backend of backends) {
      const items = plan.filter((p) => p.backend === backend);
      const context = await browser.newContext();
      const page = await context.newPage();
      page.on("pageerror", () => {});

      // Establish origin, set backend preference, reload so the loader picks it.
      await page.goto(URL, { waitUntil: "domcontentloaded" });
      await page.evaluate(
        (b) => localStorage.setItem("mopsa-backend", b),
        backend,
      );
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof window.mopsaJs !== "undefined", {
        timeout: 30000,
      });

      let backendLoadMs = null;
      for (const it of items) {
        const target = `${backend}-browser`;
        // First analyze per FILE is a cold run (wasm: fresh instance not yet
        // tiered; the very first also pays wasm compile → tracked as loadMs).
        // Subsequent reps are warm/steady-state (wasm). jsoo respawns the worker
        // each analyze, so its "warm" reps are effectively cold too.
        try {
          const t0 = Date.now();
          const res = await analyzeInPage(page, it.entry, it.config, it.options);
          if (backendLoadMs === null) backendLoadMs = Date.now() - t0;
          onRecord({
            target, entry: it.entry, phase: "cold",
            record: {
              runMs: res.runMs, loadMs: backendLoadMs,
              peakRssMB: res.memBytes ? res.memBytes / (1024 * 1024) : null,
              output: res.raw,
            },
          });
        } catch (e) {
          onRecord({ target, entry: it.entry, phase: "cold", record: { failed: true, error: String(e && e.message ? e.message : e) } });
        }

        for (let r = 0; r < reps; r++) {
          try {
            const res = await analyzeInPage(page, it.entry, it.config, it.options);
            onRecord({
              target, entry: it.entry, phase: "warm",
              record: {
                runMs: res.runMs, loadMs: backendLoadMs,
                peakRssMB: res.memBytes ? res.memBytes / (1024 * 1024) : null,
                output: res.raw,
              },
            });
          } catch (e) {
            onRecord({ target, entry: it.entry, phase: "warm", record: { failed: true, error: String(e && e.message ? e.message : e) } });
          }
        }
      }
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
  }
}
