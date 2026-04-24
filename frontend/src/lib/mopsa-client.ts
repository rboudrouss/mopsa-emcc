import type { AnalysisResult, ParsedOutput, SupportedLanguage } from './types';

// ── Default code snippets per language ───────────────────────────────────────
export const DEFAULT_CODE: Record<SupportedLanguage, string> = {
  c: `int divide(int a, int b) {
  return a / b;
}

int main() {
  int x = divide(10, 2);  // safe: result = 5
  int y = divide(x, 0);   // alarm: division by zero
  return y;
}
`,
  python: `def main():
    x = 42
    print(f"Hello, Mopsa! x = {x}")

main()
`,
  universal: `S = fun x -> x + 1
`,
};

export const FILE_EXTENSIONS: Record<SupportedLanguage, string> = {
  c: 'c',
  python: 'py',
  universal: 'uni',
};

// ── Output parsing ────────────────────────────────────────────────────────────

export function parseOutput(raw: string): ParsedOutput | null {
  const idx = raw.search(/^\{/m);
  if (idx === -1) return null;
  try {
    return JSON.parse(raw.slice(idx)) as ParsedOutput;
  } catch {
    return null;
  }
}

export function parseConfigText(text: string): unknown | null {
  try {
    // Strip // line comments
    let cleaned = text.replace(/\/\/[^\n]*/g, '');
    // Strip trailing commas before } or ]
    cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// ── ANSI color mapping ────────────────────────────────────────────────────────

export interface AnsiSpan {
  text: string;
  cls: string;
}

export function ansiToSpans(raw: string): AnsiSpan[] {
  const spans: AnsiSpan[] = [];
  const re = /\x1b\[(\d*)m/g;
  let lastIndex = 0;
  let currentCls = '';

  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      spans.push({ text: raw.slice(lastIndex, match.index), cls: currentCls });
    }
    const code = parseInt(match[1] || '0', 10);
    if (code === 0 || isNaN(code)) currentCls = '';
    else if (code === 1) currentCls = currentCls ? currentCls + ' ansi-bold' : 'ansi-bold';
    else if (code === 31) currentCls = 'ansi-error';
    else if (code === 32) currentCls = 'ansi-safe';
    else if (code === 33) currentCls = 'ansi-warn';
    else if (code === 34 || code === 36) currentCls = 'ansi-info';
    else if (code === 35) currentCls = 'ansi-domain';
    lastIndex = re.lastIndex;
  }
  if (lastIndex < raw.length) {
    spans.push({ text: raw.slice(lastIndex), cls: currentCls });
  }
  return spans;
}

// ── Options → CLI flags ───────────────────────────────────────────────────────

export function computeOptionsFlags(values: Record<string, unknown>): string[] {
  const flags: string[] = [];
  for (const [flag, value] of Object.entries(values)) {
    if (flag === '__raw') continue;
    if (value === false || value === '' || value === null || value === undefined) continue;
    if (value === true) {
      flags.push(flag);
    } else {
      flags.push(flag, String(value));
    }
  }
  return flags;
}

// ── Main analysis function ────────────────────────────────────────────────────

export async function analyzeJson(extraOptions: string[]): Promise<AnalysisResult> {
  const isHelp = extraOptions.includes('-help');
  const baseOptions = isHelp ? [] : ['-format=json', '-show-safe-checks'];
  const options = [...baseOptions, ...extraOptions];

  const t0 = performance.now();
  let raw = '';
  try {
    raw = await mopsaJs.analyze(options);
  } catch (e) {
    raw = String(e);
  }
  const durationMs = performance.now() - t0;

  return {
    raw,
    parsed: parseOutput(raw),
    durationMs,
  };
}

// ── Virtual filesystem helpers ────────────────────────────────────────────────

export function listFiles(): string[] {
  const result = mopsaJs.listDir('/');
  const [, ...names] = result;
  return names.filter((n) => n !== 'dev' && n !== 'config.json');
}

export function writeFile(path: string, content: string): void {
  const normalised = path.startsWith('/') ? path : '/' + path;
  mopsaJs.writeFile(normalised, content);
}

export function readFile(path: string): string {
  const normalised = path.startsWith('/') ? path : '/' + path;
  return mopsaJs.readFile(normalised);
}

export function deleteFile(path: string): void {
  const normalised = path.startsWith('/') ? path : '/' + path;
  mopsaJs.deleteFile(normalised);
}

export function getCodeFilePath(): string {
  return mopsaJs.getCodeFilePath()[1];
}

export function setCodeFilePath(path: string): void {
  mopsaJs.changeCodeFilePath(path);
}

// ── Language detection from config text ──────────────────────────────────────

export function detectLanguage(configText: string): SupportedLanguage {
  const match = configText.match(/"language"\s*:\s*"(\w+)"/);
  if (!match) return 'universal';
  const lang = match[1];
  if (lang === 'c') return 'c';
  if (lang === 'python') return 'python';
  return 'universal';
}
