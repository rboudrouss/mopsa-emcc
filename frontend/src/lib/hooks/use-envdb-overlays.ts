import type * as Monaco from "monaco-editor";
import { useEffect, useRef } from "react";
import {
  envEngine,
  type EnvQueryResult,
  type EnvironmentsBody,
} from "../envdb/env-engine";
import { useEnvEngine } from "./use-env-engine";
import { useEditorNav } from "../editor-nav";
import { useAppStore } from "../store";

/**
 * Editor overlays fed by the environment database of the background
 * analysis (see env-engine.ts):
 *   - coverage: a gutter bar on the lines the analysis reached, and a grey
 *     background on the lines it found unreachable (every state is ⊥);
 *   - inline values: after the code of a line, the abstract values of its
 *     variables once it has run, and of the next line's variables before
 *     that one runs (cursor line only, or every line).
 */

const MAX_INLINE = 70;
const VAR_LIKE = /^[A-Za-z_$][\w$]*(\[[^\]]*\]|\.[\w$]+|->[\w$]+)*$/;
const DECORATION = /:[^\s:]+:\d+\.\d+(-\d+(\.\d+)?)?$/;
// Python heap addresses of callables, classes and modules: noise inline.
const PY_HIDDEN =
  /^@(function|builtin_function_or_method|method|classmethod|staticmethod|module|type)\b/;

/**
 * One value as shown inline. Python variables point to heap addresses
 * ("@Inst{int}:w", "@list"): shown as their type, and hidden (null) for
 * functions, classes and modules.
 */
function valueText(v: unknown, python: boolean): string | null {
  if (v === null || v === undefined) return "⊥";
  const s = (typeof v === "object" ? JSON.stringify(v) : String(v))
    .replace(/\s+/g, " ")
    .trim();
  if (!python || !s.startsWith("@")) return s;
  if (PY_HIDDEN.test(s)) return null;
  const inst = /^@Inst\{([^}]*)\}/.exec(s);
  if (inst) return inst[1];
  return /^@([A-Za-z_][\w.]*)/.exec(s)?.[1] ?? s;
}

/** One variable as shown inline: "a = [0,10]" or, a Python variable with
 *  only a type, "values: list". */
interface InlinePart {
  name: string;
  value: string;
  isType: boolean;
}

/** The variables of a line-scope print object. A variable printed by
 *  several domains (Python: its type in the environment, its value in the
 *  numeric domain) is shown once, by value when there is one. */
export function inlineParts(env: unknown, python = false): InlinePart[] {
  const vars = new Map<string, { types: Set<string>; values: string[] }>();
  const entry = (name: string) => {
    let e = vars.get(name);
    if (!e) vars.set(name, (e = { types: new Set(), values: [] }));
    return e;
  };
  const leaf = (key: string, v: unknown) => {
    if (!key || key.startsWith("@")) return; // heap addresses' internals
    const list = Array.isArray(v) ? v : [v];
    const texts = list.map((x) => valueText(x, python));
    if (texts.some((x) => x === null)) return; // a callable, class, module
    const isType = python && list.every((x) => String(x).startsWith("@"));
    const text = [...new Set(texts as string[])].join(isType ? " | " : ", ");
    if (isType) entry(key).types.add(text);
    else entry(key).values.push(Array.isArray(v) ? `{${text}}` : text);
  };
  const visit = (key: string, v: unknown, depth: number) => {
    if (v && typeof v === "object" && !Array.isArray(v))
      for (const [k, sub] of Object.entries(v as Record<string, unknown>))
        // The top-level keys are domain groups ("float-itv ∪ int-itv",
        // "environment"): they aren't part of the names.
        visit(
          depth > 1 && VAR_LIKE.test(key) ? `${key}.${k}` : k.replace(DECORATION, ""),
          sub,
          depth + 1,
        );
    else leaf(key, v);
  };
  if (env === null || env === undefined) return [];
  visit("", env, 0);
  return [...vars].map(([name, { types, values }]) =>
    values.length > 0
      ? { name, value: [...new Set(values)].join(" ∧ "), isType: false }
      : { name, value: [...types].join(" | "), isType: true },
  );
}

/**
 * The text shown at the end of a line: the state after it, then the state
 * before the next line, each variable once. A variable whose value differs
 * between the two (entering a branch or a loop) shows both, "i = 0 → [0,9]".
 */
export function mergedInlineText(after: InlinePart[], before: InlinePart[]): string {
  const next = new Map(before.map((p) => [p.name, p]));
  const show = (p: InlinePart) => p.name + (p.isType ? ": " : " = ") + p.value;
  const parts = after.map((p) => {
    const q = next.get(p.name);
    next.delete(p.name);
    if (!q || q.value === p.value) return show(p);
    // A type next to a value is no news (Python: the value is more precise).
    if (q.isType && !p.isType) return show(p);
    if (p.isType && !q.isType) return show(q);
    return `${show(p)} → ${q.value}`;
  });
  for (const q of next.values()) parts.push(show(q));
  const text = parts.join(", ");
  return text.length > MAX_INLINE ? text.slice(0, MAX_INLINE - 1) + "…" : text;
}

/** Whether the variable shows in the source line: not a temporary or the
 *  cleanup at a block's "}" (base name of "s.f", "p->x", "*p", "self.x"). */
function inSource(name: string, source: string): boolean {
  const base = /[A-Za-z_$][\w$]*/.exec(name)?.[0];
  return !base || new RegExp(`(^|[^\\w$])${base.replace(/\$/g, "\\$")}($|[^\\w$])`).test(source);
}

/** Per call stack: the variables of the source line, bottom states left out. */
function partsByContext(
  res: EnvQueryResult<EnvironmentsBody> | undefined,
  python: boolean,
  source: string,
): Map<string, InlinePart[]> {
  const out = new Map<string, InlinePart[]>();
  if (!res || res.kind !== "ok") return out;
  for (const c of res.body.contexts)
    if (!c.bottom)
      out.set(
        JSON.stringify(c.callstack),
        inlineParts(c.env, python).filter((p) => inSource(p.name, source)),
      );
  return out;
}

export function useEnvdbOverlays(
  editorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>,
  codeFilePath: string,
  enabled: boolean,
  mountKey: number,
) {
  const { phase, generation } = useEnvEngine();
  const showCoverage = useEditorNav((s) => s.showCoverage);
  const inlineValues = useEditorNav((s) => s.inlineValues);
  const cursorLine = useEditorNav((s) => s.cursorLine);
  const coverageRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const valuesRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);

  const active = enabled && (showCoverage || inlineValues !== "off");
  useEffect(() => {
    if (active) envEngine.start();
  }, [active]);

  // Stale overlays go as soon as a new analysis starts.
  const ready = phase === "ready";
  useEffect(() => {
    if (ready && enabled) return;
    coverageRef.current?.clear();
    valuesRef.current?.clear();
  }, [ready, enabled]);

  // Coverage + the reached lines (also used by the "all lines" values).
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !enabled || !ready) return;
    let cancelled = false;
    void envEngine.getLines(codeFilePath).then((res) => {
      if (cancelled || res.kind !== "ok") return;
      const entry = res.body.files[codeFilePath] ?? { reached: [], unreachable: [] };
      const decos: Monaco.editor.IModelDeltaDecoration[] = [];
      if (showCoverage) {
        for (const line of entry.reached)
          decos.push({
            range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
            options: { linesDecorationsClassName: "mopsa-cov-reached" },
          });
        for (const line of entry.unreachable)
          decos.push({
            range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
            options: {
              isWholeLine: true,
              className: "mopsa-cov-dead",
              linesDecorationsClassName: "mopsa-cov-dead-gutter",
              hoverMessage: {
                value: "**Unreachable**: every abstract state reaching this line is ⊥.",
              },
            },
          });
      }
      coverageRef.current?.clear();
      coverageRef.current = editor.createDecorationsCollection(decos);
    });
    return () => {
      cancelled = true;
    };
  }, [editorRef, codeFilePath, enabled, ready, generation, showCoverage, mountKey]);

  // Values are stale as soon as the code changes (lines move, text changes):
  // drop them at once, the next analysis brings fresh ones.
  const code = useAppStore((s) => s.code);
  const lastCode = useRef(code);
  useEffect(() => {
    if (code === lastCode.current) return;
    lastCode.current = code;
    valuesRef.current?.clear();
  }, [code]);

  // Inline values. The cursor only matters in "cursor" mode: in "all" mode,
  // moving it must not refetch and redraw every line.
  const cursorKey = inlineValues === "cursor" ? cursorLine : null;
  const python = codeFilePath.endsWith(".py");
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !enabled || !ready || inlineValues === "off") {
      valuesRef.current?.clear();
      return;
    }
    let cancelled = false;
    void (async () => {
      // Line L shows the state after L and the state before L + 1.
      let lines: number[];
      if (inlineValues === "cursor") lines = cursorKey ? [cursorKey] : [];
      else {
        const res = await envEngine.getLines(codeFilePath);
        if (res.kind !== "ok") return;
        const reached = res.body.files[codeFilePath]?.reached ?? [];
        lines = [...new Set(reached.flatMap((l) => [l - 1, l]))].filter((l) => l >= 1);
      }
      const model = editor.getModel();
      if (cancelled || !model) return;
      lines = lines.filter((l) => l <= model.getLineCount());
      const [after, before] = await Promise.all([
        Promise.all(lines.map((l) => envEngine.getEnvironments(codeFilePath, l, "line", "post"))),
        Promise.all(lines.map((l) => envEngine.getEnvironments(codeFilePath, l + 1, "line", "entry"))),
      ]);
      if (cancelled) return;
      const decos: Monaco.editor.IModelDeltaDecoration[] = [];
      lines.forEach((line, i) => {
        const a = partsByContext(after[i], python, model.getLineContent(line));
        const b = partsByContext(
          before[i],
          python,
          line < model.getLineCount() ? model.getLineContent(line + 1) : "",
        );
        const texts = [
          ...new Set(
            [...new Set([...a.keys(), ...b.keys()])]
              .map((cs) => mergedInlineText(a.get(cs) ?? [], b.get(cs) ?? []))
              .filter(Boolean),
          ),
        ];
        if (texts.length === 0) return;
        const text =
          texts[0] +
          (texts.length > 1
            ? `  (+${texts.length - 1} other context${texts.length > 2 ? "s" : ""})`
            : "");
        const end = model.getLineMaxColumn(line);
        decos.push({
          range: { startLineNumber: line, startColumn: end, endLineNumber: line, endColumn: end },
          options: {
            showIfCollapsed: true,
            after: { content: "  " + text, inlineClassName: "mopsa-inline-value" },
          },
        });
      });
      valuesRef.current?.clear();
      valuesRef.current = editor.createDecorationsCollection(decos);
    })();
    return () => {
      cancelled = true;
    };
  }, [editorRef, codeFilePath, python, enabled, ready, generation, inlineValues, cursorKey, mountKey]);
}
