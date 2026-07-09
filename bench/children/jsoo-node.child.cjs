// One jsoo analysis in a fresh node process. The jsoo worker bundle is
// browser-shaped (Web Worker + virtual FS), so we adapt it to node:
//   1. mask process.versions.node while the bundle initialises, so js_of_ocaml
//      mounts its in-memory MlFakeDevice at "/" (as in a browser) instead of a
//      real-fs MlNodeDevice — otherwise Sys_js.create_file fails ("cannot
//      register file") and every file write blows up.
//   2. provide a minimal WebWorker `self` (postMessage / onmessage /
//      importScripts) so the bundle's Worker.set_onmessage / post_message work.
// Then we hand the same {type:'analyze'} message the browser API sends.
const fs = require("node:fs");
const path = require("node:path");

const REPO = path.join(__dirname, "..", "..");
const SHARE_JSON = path.join(REPO, "frontend", "public", "share.json");

const job = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

// Same share subset the browser API (mopsa_api_jsoo.js) sends the worker.
function flatten(tree, prefix, out) {
  for (const k of Object.keys(tree || {})) {
    const v = tree[k];
    if (typeof v === "string") out[prefix + k] = v;
    else flatten(v, prefix + k + "/", out);
  }
}
function buildShareFiles() {
  const data = JSON.parse(fs.readFileSync(SHARE_JSON, "utf8"));
  const out = {};
  flatten((data.configs || {}).universal, "configs/universal/", out);
  flatten((data.configs || {}).python, "configs/python/", out);
  flatten((data.stubs || {}).python, "stubs/python/", out);
  return out;
}

let result = null;
global.self = global;
global.importScripts = function () {}; // sync-message: sessions only, unused here
global.onmessage = null;
global.postMessage = function (m) {
  if (m && m.type === "result") result = m;
};

// (1) hide node so jsoo uses the virtual FS; restore afterwards.
const realProc = process;
global.process = new Proxy(realProc, {
  get(t, p) {
    return p === "versions" ? {} : t[p];
  },
});

const t0 = performance.now();
require(job.bundle); // (2) registers self.onmessage
global.process = realProc;
const tLoaded = performance.now();

const msg = {
  type: "analyze",
  id: 1,
  options: job.options,
  code: job.code,
  config: job.config,
  codeFile: job.vfsPath,
  extraFiles: job.extraFiles || {},
  shareFiles: buildShareFiles(),
};

let output = "";
const tRun0 = performance.now();
try {
  global.onmessage({ data: msg });
} catch (e) {
  output += "\n[jsoo harness error] " + require("util").inspect(e).slice(0, 400);
}
const tEnd = performance.now();
if (result) output = result.output + output;

const maxRssKb = realProc.resourceUsage().maxRSS;
realProc.stdout.write(
  "__BENCH_RESULT__" +
    JSON.stringify({
      loadMs: tLoaded - t0,
      runMs: tEnd - tRun0,
      peakRssMB: maxRssKb / 1024,
      output,
    }),
);
