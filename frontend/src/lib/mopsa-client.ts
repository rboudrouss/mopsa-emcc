import type { AnalysisResult, ParsedOutput, SupportedLanguage } from "./types";
import { isFlagLockedByBackend } from "./backend";
import {
  BOOL_ARG_FLAGS,
  MOPSA_DEFAULT_VALUES,
  SELECT_FLAGS,
} from "./options-schema";

// ── Default code snippets per language ───────────────────────────────────────
export const DEFAULT_CODE: Record<SupportedLanguage, string> = {
  c: `/* main() reads r[0] after free(r), an error.
 *
 * reverse() is correct, yet the default config reports a possible
 * out-of-bounds write at r[j], since intervals do not relate i, j and n. With
 * the config cell-pack-rel-itv.json (Domains panel), Mopsa finds
 * n = j + i + 1 and the false alarm disappears. "Inline: all lines" with
 * "Show: relations" displays the relations each line adds.
 */
#include <stdio.h>
#include <stdlib.h>

#define N 5

/* Writes a[0..n-1] into r[0..n-1] in reverse order. */
void reverse(const int *a, int *r, int n) {
  int j = n - 1;
  for (int i = 0; i < n; i++) {
    r[j] = a[i];
    j--;
  }
}

int main(void) {
  int a[N] = {1, 2, 3, 4, 5};
  int *r = malloc(N * sizeof(int));
  if (r == NULL)
    return 1;
  reverse(a, r, 1 + rand() % N);
  free(r);
  printf("%d\\n", r[0]); /* use after free */
  return 0;
}
`,
  python: `# find() returns None for an unknown name, and acc.withdraw() then raises an
# AttributeError.
#
# squares_desc() is correct, yet the default config reports a possible
# IndexError at out[j], since intervals do not relate i and j. With the config
# values-relational.json (Domains panel), Mopsa finds j + i = 4 at the start of
# each iteration and the false alarm disappears. "Inline: all lines" with
# "Show: relations" displays the relations each line adds.


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
    return None


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
  universal: `// The last assert fails when n = 100.
//
// With the default config (intervals), Mopsa cannot prove any of the three
// asserts. With rel-poly.json (Domains panel), it finds the loop invariants
// up = 2i and n = i + down, and proves the first two. "Inline: all lines"
// with "Show: values + relations" displays them line by line.

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
  "main.c": `/* pop() does not check that the stack is empty. When the first push() is
 * skipped, the second pop() reads data[-1] in stack.c, and the call stack of
 * the alarm leads back to main().
 *
 * The stack never holds more than 2 elements, so the puts() line is
 * unreachable and gets no green coverage bar in the margin.
 *
 * push() is called from two lines. With the cursor in push(), the Abstract
 * states panel shows one state per call.
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
  int b = pop(); /* data[-1] when the first push() was skipped */
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

/* Does not check that the stack is not empty. */
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

static int table[4] = {1, 2, 4, 8};

/* weight(i) returns table[i], and does not check that i < 4. */
static PyObject *mymod_weight(PyObject *self, PyObject *args) {
  int i;
  if (!PyArg_ParseTuple(args, "i", &i))
    return NULL;
  if (i < 0) {
    PyErr_SetString(PyExc_ValueError, "negative index");
    return NULL;
  }
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
  "main.py": `# Mopsa analyses this file and the C module mymod.c together. The loop calls
# mymod.weight(4), and the C code then reads past the end of table.
#
# mymod.weight(-1) raises a ValueError in C, caught below, so it raises no
# alarm.
import mymod

total = 0
for i in range(5):
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
