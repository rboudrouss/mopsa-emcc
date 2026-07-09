// Central path resolution + config/share loading shared by every runner.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";

export const BENCH_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
export const REPO_DIR = dirname(BENCH_DIR);

export const DIST_DIR = join(REPO_DIR, "dist");
export const FRONTEND_PUBLIC = join(REPO_DIR, "frontend", "public");
export const MOPSA_SRC = join(REPO_DIR, "deps", "mopsa-analyzer");
export const SHARE_DIR = join(MOPSA_SRC, "share", "mopsa");
export const CONFIGS_DIR = join(SHARE_DIR, "configs");
export const TESTS_DIR = join(MOPSA_SRC, "analyzer", "tests");
export const CACHE_DIR = join(BENCH_DIR, ".cache");
export const RESULTS_DIR = join(BENCH_DIR, "results");

// WASM artifacts (built by `make wasm-web-artifacts`).
export const WASM_GLUE = join(DIST_DIR, "ocamlrun.js");
export const WASM_BINARY = join(DIST_DIR, "ocamlrun.wasm");
export const WASM_DATA = join(DIST_DIR, "ocamlrun.data");

// jsoo worker bundle (built by `make jsoo-web`).
export const JSOO_BUNDLE = join(FRONTEND_PUBLIC, "mopsa_worker_jsoo.js");
export const SHARE_JSON = join(FRONTEND_PUBLIC, "share.json");

// Native mopsa binary (host opam switch). Overridable via MOPSA_BIN.
export const NATIVE_MOPSA =
  process.env.MOPSA_BIN ||
  join(process.env.HOME || "", ".opam", "4.14.2", "bin", "mopsa");

// The share default.json config per language, shared by all backends so the
// analysis workload is identical everywhere. Returns the raw JSON text.
export function loadConfig(lang) {
  const p = join(CONFIGS_DIR, lang, "default.json");
  if (!existsSync(p)) throw new Error(`config not found: ${p}`);
  return readFileSync(p, "utf8");
}

// The `-config=` value native mopsa expects (relative to its own share dir).
export function nativeConfigName(lang) {
  return `${lang}/default.json`;
}
