#!/usr/bin/env node
// extract-primitives.js — Extract OCaml C primitives from C/C++ source files.
//
// Usage: node extract-primitives.js <file1.c> [file2.c ...]
//
// Handles:
//   1. CAMLprim value func_name(…)
//   2. CAMLprim <qualifiers…> value func_name(…)   (e.g. CAMLweakdef)
//   3. CAMLprim <rettype> func_name(…)              (e.g. double, int64_t)
//   4. CAMLprim_int64_N(name)  →  caml_int64_<name> + caml_int64_<name>_native
//   5. Token-pasting macros (#define FOO(X) CAMLprim … prefix_##X(…))
//      with their invocations resolved.

const fs = require("fs");
const path = require("path");

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Strip C / C++ comments while preserving line structure. */
function stripComments(src) {
  let out = "";
  for (let i = 0; i < src.length; ) {
    const c = src[i];
    // string / char literals – skip through
    if (c === '"' || c === "'") {
      const q = c;
      out += src[i++];
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") out += src[i++];
        if (i < src.length) out += src[i++];
      }
      if (i < src.length) out += src[i++];
    } else if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") out += "\n";
        i++;
      }
      if (i < src.length) i += 2;
      out += " ";
    } else {
      out += src[i++];
    }
  }
  return out;
}

/** Join backslash-continued lines. */
const joinContinuations = (s) => s.replace(/\\\r?\n/g, " ");

/** Regex that matches a CAMLprim function *header* and captures the name.
 *  Accepts any return type (value, double, int64_t, LLVMFoo, …) and
 *  optional qualifiers between CAMLprim and the identifier (CAMLweakdef,
 *  extern "C", …).  The function name is captured in group 1. */
const PRIM_RE =
  /\bCAMLprim\s+(?:(?![\({])(?:\w+|"[^"]*")\s+)*([A-Za-z_]\w*)\s*\(/g;

/* ------------------------------------------------------------------ */
/*  Core extraction                                                   */
/* ------------------------------------------------------------------ */

function extractPrimitives(filePath) {
  const prims = new Set();
  const raw = fs.readFileSync(filePath, "utf-8");
  const clean = stripComments(raw);
  let full = joinContinuations(clean);

  // --- Pre-pass: expand object-like macros that alias CAMLprim -----------
  // e.g.  #define CAML_EXPORT CAMLprim extern "C"
  // We replace occurrences of the alias with its expansion so later phases
  // see a plain CAMLprim.
  const objMacroRe = /^\s*#\s*define\s+(\w+)\s+(CAMLprim\b.*)/;
  for (const line of full.split("\n")) {
    const m = line.match(objMacroRe);
    if (m && !m[0].includes("(")) {
      // m[1] = alias name, m[2] = expansion containing CAMLprim
      const aliasRe = new RegExp(`\\b${m[1]}\\b`, "g");
      // Only replace in non-#define lines — rebuild full text
      full = full
        .split("\n")
        .map((l) => (/^\s*#\s*define\b/.test(l) ? l : l.replace(aliasRe, m[2])))
        .join("\n");
    }
  }

  const lines = full.split("\n");

  // --- Phase 0: collect ALL function-like macro names --------------------
  // Used to detect false positives like DEFINE_NAN_CMP in:
  //   CAMLprim value caml_eq_float DEFINE_NAN_CMP(==)
  const funcMacros = new Set();
  for (const line of lines) {
    const m = line.match(/^\s*#\s*define\s+(\w+)\s*\(/);
    if (m) funcMacros.add(m[1]);
  }

  // --- C++ detection ---------------------------------------------------------
  // In C++ files, real OCaml primitives MUST have extern "C" linkage.
  // Class methods marked CAMLprim do NOT have extern "C" and should be
  // excluded.
  const isCpp = /\.(cc|cpp|cxx|C)$/.test(filePath);

  // --- Phase 1: collect #define macros whose body contains CAMLprim ------
  // Track line index so we can resolve redefinitions (e.g. FN1 redefined
  // for ctypes_ldouble_ vs ctypes_ldouble_complex_).
  // macrosByName: name → [{ lineIdx, params, body }, …]  (sorted by lineIdx)
  const macrosByName = new Map();
  for (let li = 0; li < lines.length; li++) {
    const m = lines[li].match(/^\s*#\s*define\s+(\w+)\(([^)]*)\)\s+(.*)/);
    if (m && m[3].includes("CAMLprim")) {
      const entry = {
        lineIdx: li,
        params: m[2].split(",").map((p) => p.trim()),
        body: m[3],
      };
      if (!macrosByName.has(m[1])) macrosByName.set(m[1], []);
      macrosByName.get(m[1]).push(entry);
    }
  }

  // --- Phase 2: expand macro invocations ---------------------------------
  // For each invocation, pick the most recent preceding definition.
  for (const [macroName, defs] of macrosByName) {
    const re = new RegExp(`(?:^|[^\\w])${macroName}\\s*\\(`, "g");
    for (let li = 0; li < lines.length; li++) {
      if (/^\s*#\s*define\b/.test(lines[li])) continue;
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(lines[li])) !== null) {
        // find the active definition: last def with lineIdx < li
        let activeDef = null;
        for (const d of defs) {
          if (d.lineIdx < li) activeDef = d;
          else break;
        }
        if (!activeDef) continue;

        // extract balanced parentheses for the arguments
        const start = m.index + m[0].length;
        let depth = 1,
          j = start;
        while (j < lines[li].length && depth > 0) {
          if (lines[li][j] === "(") depth++;
          else if (lines[li][j] === ")") depth--;
          j++;
        }
        const argsStr = lines[li].slice(start, j - 1);
        const args = splitArgs(argsStr);
        if (args.length !== activeDef.params.length) continue;

        // substitute params then collapse ##
        let exp = activeDef.body;
        for (let i = 0; i < activeDef.params.length; i++) {
          exp = exp.replace(
            new RegExp(`\\b${activeDef.params[i]}\\b`, "g"),
            args[i],
          );
        }
        exp = exp.replace(/\s*##\s*/g, "");

        // harvest names
        let pm;
        PRIM_RE.lastIndex = 0;
        while ((pm = PRIM_RE.exec(exp)) !== null) prims.add(pm[1]);
      }
    }
  }

  // --- Phase 3: direct (non-macro) CAMLprim declarations -----------------
  for (const line of lines) {
    if (/^\s*#\s*define\b/.test(line)) continue;
    if (line.includes("##")) continue; // token-paste → handled in Phase 2
    // In C++ files, real OCaml primitives must have extern "C" linkage
    // (either directly or via macro expansion).  Skip lines without it.
    if (isCpp && !/extern\s*"C"/.test(line)) continue;
    let m;
    PRIM_RE.lastIndex = 0;
    while ((m = PRIM_RE.exec(line)) !== null) {
      const name = m[1];
      // Skip C++ class method definitions (Class::method).
      const fragment = line.slice(m.index, m.index + m[0].length);
      if (fragment.includes("::")) continue;
      if (funcMacros.has(name)) {
        // The "name" is actually a param-list macro (e.g. DEFINE_NAN_CMP).
        // The real function name is the identifier just before the macro.
        const before = line.slice(0, m.index + m[0].length);
        const words = before.match(/([A-Za-z_]\w*)\s+\w+\s*\(\s*$/);
        if (words) prims.add(words[1]);
      } else {
        prims.add(name);
      }
    }
  }

  // --- Phase 4: CAMLprim_int64_N(name) shorthand -------------------------
  for (const line of lines) {
    if (/^\s*#\s*define\b/.test(line)) continue;
    const r = /\bCAMLprim_int64_\d\((\w+)\)/g;
    let m;
    while ((m = r.exec(line)) !== null) {
      prims.add(`caml_int64_${m[1]}`);
      prims.add(`caml_int64_${m[1]}_native`);
    }
  }

  // --- Phase 5: bare "value func(value …)" without CAMLprim ---------------
  // CamlIDL-generated code and some hand-written stubs declare primitives as
  //   value func_name(value a, value b, …)
  // at file scope (no "static", no CAMLprim).  We detect these by checking
  // that the return type is "value" and ALL parameters are "value" typed.
  // We must join multi-line declarations to see the full parameter list.
  const joined = full; // already has continuations joined
  const jlines = joined.split("\n");
  for (let i = 0; i < jlines.length; i++) {
    const ln = jlines[i];
    if (/^\s*#/.test(ln)) continue;
    // Match "value IDENTIFIER(" at the very start of a line (no leading type)
    const hdr = ln.match(/^value\s+([A-Za-z_]\w*)\s*\(/);
    if (!hdr) continue;
    // Already found via CAMLprim phases?
    if (prims.has(hdr[1])) continue;
    // Collect the full text from "(" to the matching ")"
    let text = ln.slice(hdr.index + hdr[0].length - 1); // starts with "("
    let depth = 0,
      j = i;
    let buf = "";
    outer: for (; j < jlines.length; j++) {
      const s = j === i ? text : jlines[j];
      for (let k = 0; k < s.length; k++) {
        const ch = s[k];
        if (ch === "(") depth++;
        else if (ch === ")") {
          depth--;
          if (depth === 0) {
            buf += s.slice(0, k);
            break outer;
          }
        }
      }
      buf += (j === i ? s : s) + " ";
    }
    // buf now contains everything between the outer parens (exclusive)
    // Remove the leading "("
    buf = buf.replace(/^\(/, "").trim();
    if (!buf) continue; // empty param list like func() — not an OCaml prim
    // Split parameters and check each is "value <name>"
    const params = splitArgs(buf);
    const allValue = params.every((p) => /^\s*value\s+\w+\s*$/.test(p.trim()));
    if (allValue) prims.add(hdr[1]);
  }

  return prims;
}

/** Split macro arguments respecting nested parens and commas. */
function splitArgs(s) {
  const args = [];
  let depth = 0,
    cur = "";
  for (const ch of s) {
    if (ch === "," && depth === 0) {
      args.push(cur.trim());
      cur = "";
    } else {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      cur += ch;
    }
  }
  args.push(cur.trim());
  return args;
}

/* ------------------------------------------------------------------ */
/*  Main                                                              */
/* ------------------------------------------------------------------ */
const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: node extract-primitives.js <file1.c> [file2.c ...]");
  process.exit(1);
}
const all = new Set();
for (const f of files) {
  const p = path.resolve(f);
  if (!fs.existsSync(p)) {
    console.error(`File not found: ${f}`);
    continue;
  }
  for (const name of extractPrimitives(p)) all.add(name);
}
[...all].sort().forEach((n) => console.log(n));
