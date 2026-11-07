import type * as Monaco from "monaco-editor";
import { useEffect, useRef } from "react";
import { envEngine } from "../envdb/env-engine";
import { useEnvEngine } from "./use-env-engine";
import { useEditorNav } from "../editor-nav";

/**
 * Editor overlays fed by the environment database of the background
 * analysis (see env-engine.ts):
 *   - coverage: a gutter bar on the lines the analysis reached, and a grey
 *     background on the lines it found unreachable (every state is ⊥);
 *   - inline values: the abstract values of the variables of a line,
 *     after its code (cursor line only, or every reached line).
 * Only in Scan mode; the interactive REPL has its own way to print states.
 */

const MAX_INLINE = 90;
const VAR_LIKE = /^[A-Za-z_$][\w$]*(\[[^\]]*\]|\.[\w$]+|->[\w$]+)*$/;

/** "x ∈ [0,10], p ∈ {&a}" from a line-scope print object. */
export function inlineText(env: unknown): string {
  const parts: string[] = [];
  const visit = (key: string, v: unknown) => {
    if (v === null || v === undefined) parts.push(`${key} = ⊥`);
    else if (Array.isArray(v))
      parts.push(`${key} ∈ {${v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ")}}`);
    else if (typeof v === "object")
      for (const [k, sub] of Object.entries(v as Record<string, unknown>))
        // Domain groups ("float-itv ∪ int-itv") aren't part of the names.
        visit(VAR_LIKE.test(key) ? `${key}.${k}` : k, sub);
    else parts.push(`${key} = ${String(v)}`);
  };
  if (env && typeof env === "object" && !Array.isArray(env))
    for (const [k, v] of Object.entries(env as Record<string, unknown>))
      visit(k.replace(/:[^\s:]+:\d+\.\d+(-\d+(\.\d+)?)?$/, ""), v);
  const text = [...new Set(parts)].join(", ");
  return text.length > MAX_INLINE ? text.slice(0, MAX_INLINE - 1) + "…" : text;
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

  // Inline values.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !enabled || !ready || inlineValues === "off") {
      valuesRef.current?.clear();
      return;
    }
    let cancelled = false;
    void (async () => {
      let lines: number[];
      if (inlineValues === "cursor") lines = cursorLine ? [cursorLine] : [];
      else {
        const res = await envEngine.getLines(codeFilePath);
        if (res.kind !== "ok") return;
        lines = res.body.files[codeFilePath]?.reached ?? [];
      }
      const model = editor.getModel();
      if (!model) return;
      const decos: Monaco.editor.IModelDeltaDecoration[] = [];
      for (const line of lines) {
        if (line > model.getLineCount()) continue;
        const res = await envEngine.getEnvironments(codeFilePath, line, "line");
        if (cancelled) return;
        if (res.kind !== "ok") continue;
        const ctx = res.body.contexts.filter((c) => !c.bottom);
        if (ctx.length === 0) continue;
        let text = inlineText(ctx[0].env);
        if (!text) continue;
        if (ctx.length > 1) text += `  (+${ctx.length - 1} context${ctx.length > 2 ? "s" : ""})`;
        const end = model.getLineMaxColumn(line);
        decos.push({
          range: { startLineNumber: line, startColumn: end, endLineNumber: line, endColumn: end },
          options: {
            showIfCollapsed: true,
            after: { content: "  " + text, inlineClassName: "mopsa-inline-value" },
          },
        });
      }
      if (cancelled) return;
      valuesRef.current?.clear();
      valuesRef.current = editor.createDecorationsCollection(decos);
    })();
    return () => {
      cancelled = true;
    };
  }, [editorRef, codeFilePath, enabled, ready, generation, inlineValues, cursorLine, mountKey]);
}
