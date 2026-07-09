// Spawn helper: run a command to completion, capturing stdout/stderr, wall
// time, and (optionally, via GNU /usr/bin/time -v) peak RSS.
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

// Current RSS (kB) of one pid, from /proc/<pid>/status VmRSS.
function readVmRssKb(pid) {
  try {
    const m = readFileSync(`/proc/${pid}/status`, "utf8").match(/VmRSS:\s*(\d+)\s*kB/);
    return m ? parseInt(m[1], 10) : 0;
  } catch {
    return 0; // process gone
  }
}

// Summed current RSS (kB) of `root` and all its descendants. The `mopsa`
// launcher is a bash wrapper that execs mopsa.exe, so the real memory lives in a
// grandchild — sampling only the direct child would miss it. Returns 0 if the
// tree is gone / non-Linux.
function readTreeRssKb(root) {
  let children;
  try {
    children = readdirSync("/proc");
  } catch {
    return 0;
  }
  const parent = new Map(); // pid → ppid
  for (const name of children) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = readFileSync(`/proc/${name}/stat`, "utf8");
      // field 4 (ppid) sits after the possibly-space-containing comm in "(...)".
      const after = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      parent.set(Number(name), Number(after[1]));
    } catch {
      /* vanished */
    }
  }
  const inTree = (pid) => {
    let p = pid;
    for (let i = 0; i < 64 && p > 1; i++) {
      if (p === root) return true;
      p = parent.get(p);
      if (p == null) return false;
    }
    return pid === root;
  };
  let sum = 0;
  for (const pid of parent.keys()) if (inTree(pid)) sum += readVmRssKb(pid);
  return sum;
}

export function runProcess(cmd, args, { cwd, env, timeoutMs = 300000, sampleRss = false } = {}) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let peakRssKb = null;
    const child = spawn(cmd, args, { cwd, env: env || process.env });

    let sampler = null;
    if (sampleRss) {
      sampler = setInterval(() => {
        const v = readTreeRssKb(child.pid);
        if (v > 0 && (peakRssKb == null || v > peakRssKb)) peakRssKb = v;
      }, 15);
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      if (sampler) clearInterval(sampler);
      resolve({ code: -1, stdout, stderr: stderr + String(e), wallMs: performance.now() - t0, spawnError: String(e) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (sampler) clearInterval(sampler);
      resolve({
        code,
        stdout,
        stderr,
        wallMs: performance.now() - t0,
        timedOut,
        rssKb: peakRssKb,
      });
    });
  });
}

// Extract the __BENCH_RESULT__<json> line a child prints, if any.
export function parseChildResult(stdout) {
  const idx = stdout.indexOf("__BENCH_RESULT__");
  if (idx === -1) return null;
  try {
    return JSON.parse(stdout.slice(idx + "__BENCH_RESULT__".length));
  } catch {
    return null;
  }
}
