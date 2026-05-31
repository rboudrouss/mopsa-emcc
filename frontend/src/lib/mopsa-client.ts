import type { AnalysisResult, ParsedOutput, SupportedLanguage } from "./types";
import {
  BOOL_ARG_FLAGS,
  MOPSA_DEFAULT_VALUES,
  SELECT_FLAGS,
} from "./options-schema";

// ── Default code snippets per language ───────────────────────────────────────
export const DEFAULT_CODE: Record<SupportedLanguage, string> = {
  c: `int sign(int x) {
  if (x > 0) return 1;
  if (x < 0) return -1;
  return 0;
}

int classify(int a, int b) {
  return 10 / sign(a - b);  /* alarm: division by zero when a == b */
}

int main() {
  return classify(3, 3);
}
`,
  python: `def average(values):
    total = 0
    for v in values:
        total += v
    return total / len(values)  # ZeroDivisionError if values is []

def above_threshold(data, threshold):
    filtered = [x for x in data if x > threshold]
    return average(filtered)  # alarm: filtered may be empty!

result = above_threshold([1, 2, 3], 10)
`,
  universal: `int n;
int i;
int count;

n = rand(1, 10);
i = 0;
count = 0;

while (i < n) {
  if (rand(0, 1) == 0) {
    count = count + 1;
  };
  i = i + 1;
};

assert(count == n);
`,
};

// ── Multi-file C example (two-file workspace) ─────────────────────────────────

export const MULTIFILE_C: Record<string, string> = {
  "main.c": `void fill(int n);
int read_first();

int main() {
  fill(5);          /* triggers off-by-one in utils.c */
  return read_first();
}
`,
  "utils.c": `int buf[5];

/* off-by-one: when n == 5, writes buf[5] — out of bounds! */
void fill(int n) {
  for (int i = 0; i <= n; i++)
    buf[i] = i * 2;
}

int read_first() { return buf[0]; }
`,
};

// ── Multilanguage C+Python example (C extension called from Python) ───────────

export const MULTILANG_CPYTHON: Record<string, string> = {
  "mymod.c": `#include <Python.h>

/* A tiny Python extension module written in C.
   Exposes mymod.divide(a, b) to Python — but forgets to check b != 0. */
static PyObject*
mymod_divide(PyObject *self, PyObject *args)
{
  int a, b;
  if (!PyArg_ParseTuple(args, "ii", &a, &b))
    return NULL;
  int r = a / b;  /* alarm: division by zero when b == 0 */
  return Py_BuildValue("i", r);
}

static PyMethodDef methods[] = {
  {"divide", mymod_divide, METH_VARARGS, "Integer division"},
  {NULL, NULL, 0, NULL}
};

static struct PyModuleDef mymodule = {
  PyModuleDef_HEAD_INIT, "mymod", NULL, -1, methods
};

PyMODINIT_FUNC
PyInit_mymod(void)
{
  return PyModule_Create(&mymodule);
}
`,
  "main.py": `import mymod
import random

# Reaches the C function, which divides without guarding against b == 0.
print(mymod.divide(10, random.randint(-10, 10)))  # alarm: triggers division by zero in mymod.c
`,
};

// ── Output parsing ────────────────────────────────────────────────────────────

function parseOutput(raw: string): ParsedOutput | null {
  const idx = raw.search(/^\{/m);
  if (idx === -1) return null;
  try {
    return JSON.parse(raw.slice(idx)) as ParsedOutput;
  } catch {
    return null;
  }
}

export function extractPreJson(raw: string): string {
  const idx = raw.search(/^\{/m);
  const text = idx === -1 ? raw : raw.slice(0, idx);
  return text.trimEnd();
}

export function parseConfigText(text: string): unknown | null {
  try {
    // Strip // line comments
    let cleaned = text.replace(/\/\/[^\n]*/g, "");
    // Strip trailing commas before } or ]
    cleaned = cleaned.replace(/,\s*([\]}])/g, "$1");
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// ── ANSI color mapping ────────────────────────────────────────────────────────

interface AnsiSpan {
  text: string;
  cls: string;
}

export function ansiToSpans(raw: string): AnsiSpan[] {
  const spans: AnsiSpan[] = [];
  // Match any CSI escape sequence; only SGR ('m') ones affect styling
  const re = /\x1b\[([0-9;]*)([A-Za-z])/g;
  let lastIndex = 0;
  const classes = new Set<string>();

  const COLOR_CLASSES = [
    "ansi-error",
    "ansi-safe",
    "ansi-warn",
    "ansi-info",
    "ansi-domain",
  ];

  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      spans.push({
        text: raw.slice(lastIndex, match.index),
        cls: Array.from(classes).join(" "),
      });
    }

    if (match[2] === "m") {
      const codes = match[1]
        ? match[1].split(";").map((s) => parseInt(s, 10))
        : [0];
      for (const code of codes) {
        if (code === 0 || isNaN(code)) {
          classes.clear();
        } else if (code === 1) {
          classes.add("ansi-bold");
        } else if (code === 22) {
          classes.delete("ansi-bold");
        } else if (code === 39) {
          COLOR_CLASSES.forEach((c) => classes.delete(c));
        } else if (code === 31 || code === 91) {
          COLOR_CLASSES.forEach((c) => classes.delete(c));
          classes.add("ansi-error");
        } else if (code === 32 || code === 92) {
          COLOR_CLASSES.forEach((c) => classes.delete(c));
          classes.add("ansi-safe");
        } else if (code === 33 || code === 93) {
          COLOR_CLASSES.forEach((c) => classes.delete(c));
          classes.add("ansi-warn");
        } else if (code === 34 || code === 36 || code === 94 || code === 96) {
          COLOR_CLASSES.forEach((c) => classes.delete(c));
          classes.add("ansi-info");
        } else if (code === 35 || code === 95) {
          COLOR_CLASSES.forEach((c) => classes.delete(c));
          classes.add("ansi-domain");
        }
      }
    }
    // Non-SGR CSI sequences (cursor movement, etc.) are consumed without emitting text

    lastIndex = re.lastIndex;
  }
  if (lastIndex < raw.length) {
    spans.push({
      text: raw.slice(lastIndex),
      cls: Array.from(classes).join(" "),
    });
  }
  return spans;
}

// ── Options → CLI flags ───────────────────────────────────────────────────────

export function computeOptionsFlags(values: Record<string, unknown>): string[] {
  const flags: string[] = [];
  for (const [flag, value] of Object.entries(values)) {
    if (flag === "__raw") continue;
    if (value === null || value === undefined) continue;
    if (value === MOPSA_DEFAULT_VALUES[flag]) continue;
    if (BOOL_ARG_FLAGS.has(flag)) {
      flags.push(flag, value ? "true" : "false");
    } else if (value === false || value === "") {
      continue;
    } else if (value === true) {
      flags.push(flag);
    } else if (SELECT_FLAGS.has(flag)) {
      flags.push(`${flag}=${String(value)}`);
    } else {
      flags.push(flag, String(value));
    }
  }
  return flags;
}

// ── Main analysis function ────────────────────────────────────────────────────

export async function analyzeJson(
  extraOptions: string[],
): Promise<AnalysisResult | null> {
  let isHelp =
    extraOptions.includes("-help") ||
    extraOptions.includes("--help") ||
    extraOptions.includes("-h");
  const options = isHelp
    ? [
        "-help",
        ...extraOptions.filter(
          (o) => o !== "-help" && o !== "--help" && o !== "-h",
        ),
      ]
    : [...extraOptions];

  const t0 = performance.now();
  let raw: string | null = "";
  try {
    raw = await mopsaJs.analyze(options);
  } catch (e) {
    raw = String(e);
  }
  // null ⇒ a newer analyze() superseded this run; report nothing so the caller
  // leaves the previous result on screen.
  if (raw === null) return null;
  const durationMs = performance.now() - t0;

  return {
    raw,
    parsed: parseOutput(raw),
    durationMs,
  };
}

// ── Virtual filesystem helpers ────────────────────────────────────────────────

export function writeFile(path: string, content: string): void {
  const normalised = path.startsWith("/") ? path : "/" + path;
  const withNewline = content.endsWith("\n") ? content : content + "\n";
  mopsaJs.writeFile(normalised, withNewline);
}

export function readFile(path: string): string {
  const normalised = path.startsWith("/") ? path : "/" + path;
  return mopsaJs.readFile(normalised);
}

export function deleteFile(path: string): void {
  const normalised = path.startsWith("/") ? path : "/" + path;
  mopsaJs.deleteFile(normalised);
}

export function getCodeFilePath(): string {
  return mopsaJs.getCodeFilePath()[1];
}

export function setCodeFilePath(path: string): void {
  mopsaJs.changeCodeFilePath(path);
}
