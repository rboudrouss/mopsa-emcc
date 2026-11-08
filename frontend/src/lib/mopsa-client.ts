import type { AnalysisResult, ParsedOutput, SupportedLanguage } from "./types";
import { isFlagLockedByBackend } from "./backend";
import {
  BOOL_ARG_FLAGS,
  MOPSA_DEFAULT_VALUES,
  SELECT_FLAGS,
} from "./options-schema";

// ── Default code snippets per language ───────────────────────────────────────
export const DEFAULT_CODE: Record<SupportedLanguage, string> = {
  c: `/* Mopsa analyses C programs for run-time errors: invalid memory accesses,
 * integer overflows, divisions by zero, misuses of the C library...
 *
 * 1. Run the analysis (the Run button, or each edit with auto-run): the
 *    use of rs after free() is an error (red), and r[j] in reverse() is a
 *    warning (orange). Hover them, or see the Checks panel.
 * 2. The r[j] warning is a false alarm: intervals alone don't know that
 *    i + j = n - 1. In Domains, pick the config cell-pack-rel-itv.json
 *    (relations between variables) and run again: only the real bug is left.
 *    Then set the editor to "Inline: all lines" and "Show: relations" to
 *    see the relations each line brings.
 * 3. Put the cursor in reverse(): the Abstract states panel shows its state
 *    for each of its two calls, before or after the line.
 */
#include <stdio.h>
#include <stdlib.h>

/* Reverse a[0..n-1] into a new heap buffer. */
int *reverse(const int *a, int n) {
  int *r = malloc(n * sizeof(int));
  if (r == NULL)
    exit(1);
  int j = n - 1;
  for (int i = 0; i < n; i++) {
    r[j] = a[i];
    j--;
  }
  return r;
}

int main(void) {
  int small[3] = {1, 2, 3};
  int big[5] = {10, 20, 30, 40, 50};

  int *rs = reverse(small, 3);
  int *rb = reverse(big, 5);
  free(rs);
  printf("%d %d\\n", rb[0], rs[0]); /* bug: rs was freed */
  free(rb);
  return 0;
}
`,
  python: `# Mopsa looks for the exceptions a Python program may let escape.
#
# 1. Run the analysis: find() returns None for an unknown name, so
#    acc.withdraw() may raise an AttributeError (see the Checks panel, or
#    hover the underlined code).
# 2. squares_desc() is correct, yet the default config reports an IndexError
#    at out[j]: intervals alone don't know that j = n - 1 - i.
#    In Domains, pick the config values-relational.json and run again: the
#    alarm is gone. Then set the editor to "Inline: all lines" and
#    "Show: relations" to see the relation Mopsa found (j + i = n - 1).
# 3. Put the cursor on a line: the Abstract states panel shows the state
#    before or after it, per call stack.


class Account:
    def __init__(self, owner, balance):
        self.owner = owner
        self.balance = balance

    def withdraw(self, amount):
        if amount > self.balance:
            raise ValueError("insufficient funds")
        self.balance -= amount


def find(accounts, name):
    for a in accounts:
        if a.owner == name:
            return a
    return None  # bug: the callers don't expect it


def squares_desc(n):
    """[(n-1)², ..., 4, 1, 0]"""
    out = [0] * n
    j = n - 1
    for i in range(n):
        out[j] = i * i
        j -= 1
    return out


accounts = [Account("alice", 100), Account("bob", 50)]
for name in ["alice", "carol"]:
    acc = find(accounts, name)
    try:
        acc.withdraw(30)
    except ValueError:
        print("refused")

print(squares_desc(5))
`,
  universal: `// Universal: Mopsa's toy language, made to try its abstract domains.
//
// 1. Run the analysis with the default config (intervals): every assert
//    is an alarm, intervals can't relate i, up and down.
// 2. In Domains, pick the config rel-poly.json (polyhedra) and run again:
//    Mopsa proves the first two asserts, and only the last one, a real
//    bug, remains (up reaches 200 when n = 100).
// 3. Set the editor to "Inline: all lines" and "Show: values + relations"
//    to see what each line brings: up = 2i, i + down = n...

int n;
int i;
int up;
int down;

n = rand(0, 100);
i = 0;
up = 0;
down = n;
while (i < n) {
  i = i + 1;
  up = up + 2;
  down = down - 1;
}

assert(down == 0);
assert(up == 2 * n);
assert(up < 200);
`,
};

// ── Multi-file C example (two-file workspace) ─────────────────────────────────

export const MULTIFILE_C: Record<string, string> = {
  "main.c": `/* Two files analysed together: a bounded stack (stack.c) and its client.
 *
 * 1. Run the analysis: pop() reads data[-1] when the stack is empty. The
 *    alarm is in stack.c, its call stack leads back to main().
 * 2. With Coverage on, the lines the analysis reached have a green bar in
 *    the margin: not the puts() line below, Mopsa proved it unreachable, as
 *    the stack never holds more than 2 elements here.
 * 3. Put the cursor in push() (stack.c): the Abstract states panel shows
 *    one state per call of push().
 */
#include <stdio.h>
#include <stdlib.h>

void push(int v);
int pop(void);
int size(void);

int main(void) {
  if (rand() % 2)
    push(10);
  push(20);
  if (size() > 2)
    puts("never printed");
  int a = pop();
  int b = pop(); /* bug: the stack is empty when the first push() didn't happen */
  printf("%d %d\\n", a, b);
  return 0;
}
`,
  "stack.c": `#define CAPACITY 8

static int data[CAPACITY];
static int top = 0;

void push(int v) {
  if (top < CAPACITY)
    data[top++] = v;
}

/* Doesn't check that the stack isn't empty. */
int pop(void) {
  top--;
  return data[top];
}

int size(void) { return top; }
`,
};

// ── C + Python example (multi-language workspace) ─────────────────────────────

export const MULTILANG_CPYTHON: Record<string, string> = {
  "mymod.c": `#include <Python.h>

/* A Python extension module written in C: weight(i) returns table[i]. */

static int table[4] = {1, 2, 4, 8};

static PyObject *mymod_weight(PyObject *self, PyObject *args) {
  int i;
  if (!PyArg_ParseTuple(args, "i", &i))
    return NULL;
  if (i < 0) {
    /* Raised here in C, caught in main.py */
    PyErr_SetString(PyExc_ValueError, "negative index");
    return NULL;
  }
  /* bug: no upper bound check, table has 4 entries */
  return Py_BuildValue("i", table[i]);
}

static PyMethodDef methods[] = {
  {"weight", mymod_weight, METH_VARARGS, "The weight of an index"},
  {NULL, NULL, 0, NULL}
};

static struct PyModuleDef mymodule = {
  PyModuleDef_HEAD_INIT, "mymod", NULL, -1, methods
};

PyMODINIT_FUNC PyInit_mymod(void) {
  return PyModule_Create(&mymodule);
}
`,
  "main.py": `# A Python program calling a C extension module (mymod.c): Mopsa analyses
# both languages together.
#
# 1. Run the analysis: the loop calls mymod.weight(4), and the C code reads
#    table[4], past the end of its table (the alarm is in mymod.c).
# 2. mymod.weight(-1) raises a ValueError in C, caught here in Python: no
#    alarm for it.
import mymod

total = 0
for i in range(5):  # one index too many
    total += mymod.weight(i)

try:
    mymod.weight(-1)
except ValueError:
    print("refused")

print(total)
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
    // "__" prefix = UI-only pseudo-options (__raw, __backend), never argv.
    if (flag.startsWith("__")) continue;
    if (isFlagLockedByBackend(flag)) continue;
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
  onProgress?: (entries: MopsaProgressEntry[]) => void,
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
    raw = await mopsaJs.analyze(options, onProgress);
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
