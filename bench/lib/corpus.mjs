// Benchmark corpus: files drawn from deps/mopsa-analyzer/analyzer/tests.
// Each entry analyzes one source file. `lang` drives config + capability
// filtering (jsoo cannot do C). `rel` is the path under tests/.
//
// Override with BENCH_CORPUS=universal or a comma list of ids, or extend here.
import { readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { TESTS_DIR } from "./paths.mjs";

const RAW = [
  // ── universal (smallest, pure OCaml numeric/loop iterators) ──────────────
  { lang: "universal", rel: "universal/int_tests.u" },
  { lang: "universal", rel: "universal/loop_tests.u" },
  { lang: "universal", rel: "universal/string_tests.u" },
  { lang: "universal", rel: "universal/function_tests.u" },

  // ── python (moderate) ───────────────────────────────────────────────────
  { lang: "python", rel: "python/list_tests.py" },
  { lang: "python", rel: "python/class_tests.py" },
  { lang: "python", rel: "python/exception_tests.py" },
  { lang: "python", rel: "python/generator_tests.py" },
  { lang: "python", rel: "python/misc_tests.py" },

  // ── c (largest; wasm + native only, jsoo has no C frontend) ──────────────
  { lang: "c", rel: "c/int_tests.c" },
  { lang: "c", rel: "c/array_tests.c" },
  { lang: "c", rel: "c/struct_tests.c" },
  { lang: "c", rel: "c/function_tests.c" },
  { lang: "c", rel: "c/pointer_tests.c" },
];

export function loadCorpus() {
  let entries = RAW.map((e) => {
    const abs = join(TESTS_DIR, e.rel);
    const name = basename(e.rel); // vfs filename, e.g. int_tests.c
    const code = readFileSync(abs, "utf8");
    return {
      id: e.rel,
      lang: e.lang,
      name,
      abs,
      vfsPath: "/" + name,
      code,
      lines: code.split("\n").length,
      bytes: Buffer.byteLength(code),
    };
  });

  const filter = process.env.BENCH_CORPUS;
  if (filter) {
    const set = new Set(filter.split(","));
    entries = entries.filter(
      (e) => set.has(e.lang) || set.has(e.id) || set.has(e.name),
    );
  }
  return entries;
}
