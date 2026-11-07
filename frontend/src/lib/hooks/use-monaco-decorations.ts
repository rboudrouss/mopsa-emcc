import type * as Monaco from "monaco-editor";
import { useEffect, useRef } from "react";
import type { Assumption, CheckItem, PanicInfo } from "../types";
import { inFile } from "../index";

function toRange(r: CheckItem["range"]): Monaco.IRange {
  return {
    startLineNumber: r.start!.line,
    startColumn: r.start!.column,
    endLineNumber: r.end!.line,
    endColumn: r.end!.column + 1,
  };
}

export function useMonacoDecorations(
  editorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>,
  checks: CheckItem[],
  codeFilePath: string,
  mountKey: number,
  assumptions: Assumption[] = [],
  panic: PanicInfo | null = null,
  showSafe = false,
) {
  const collectionRef =
    useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const decorations: Monaco.editor.IModelDeltaDecoration[] = [];

    for (const c of checks) {
      if (c.kind !== "warning" && c.kind !== "error") continue;
      if (!c.range?.start) continue;

      const primaryInFile = inFile(c.range.start.file, codeFilePath);
      const hasCallsiteInFile = c.callstack.some(
        (f) => f.range?.start && inFile(f.range.start.file, codeFilePath),
      );

      if (!primaryInFile && !hasCallsiteInFile) continue;

      const isError = c.kind === "error";
      const label = isError ? "🔴" : "⚠️";
      const hoverLines = [`**${label} ${c.title}**`];
      if (c.messages) hoverLines.push("", c.messages);
      if (c.callstack.length > 0) {
        hoverLines.push("", "**Call stack:**");
        for (const frame of c.callstack) {
          if (!frame.range?.start) continue;
          hoverLines.push(
            `- \`${frame.function}\` : ${frame.range.start.file}:${frame.range.start.line}`,
          );
        }
      }

      // Primary alarm location (only when the alarm itself is in this file)
      if (primaryInFile) {
        decorations.push({
          range: toRange(c.range),
          options: {
            inlineClassName: isError ? "mopsa-error-span" : "mopsa-warn-span",
            isWholeLine: false,
            hoverMessage: { value: hoverLines.join("\n"), isTrusted: false },
            minimap: { color: isError ? "#f87171" : "#f5b544", position: 1 },
          },
        });
      }

      // Call-site frames in this file (including cross-file alarms)
      for (const frame of c.callstack) {
        if (
          !frame.range?.start ||
          !inFile(frame.range.start.file, codeFilePath)
        )
          continue;
        const alarmLocation = primaryInFile
          ? `line ${c.range.start.line}`
          : `${c.range.start.file.split("/").pop()}:${c.range.start.line}`;
        decorations.push({
          range: toRange(frame.range),
          options: {
            inlineClassName: "mopsa-callsite-span",
            isWholeLine: false,
            hoverMessage: {
              value: `**↳ \`${frame.function}\`** : call site\n\nLeads to: **${c.title}** (${alarmLocation})${c.messages ? "\n\n" + c.messages : ""}`,
              isTrusted: false,
            },
            minimap: {
              color: isError ? "#f871714d" : "#f5b5444d",
              position: 1,
            },
          },
        });
      }
    }

    // Checks proved safe: one discreet gutter mark per line, the details
    // in its hover (a small program has dozens of them).
    if (showSafe) {
      const safeByLine = new Map<number, Map<string, number>>();
      for (const c of checks) {
        if (c.kind !== "safe" || !c.range?.start) continue;
        if (!inFile(c.range.start.file, codeFilePath)) continue;
        const titles = safeByLine.get(c.range.start.line) ?? new Map();
        titles.set(c.title, (titles.get(c.title) ?? 0) + 1);
        safeByLine.set(c.range.start.line, titles);
      }
      for (const [line, titles] of safeByLine) {
        const list = [...titles]
          .map(([t, n]) => `- ✓ ${t}${n > 1 ? ` (×${n})` : ""}`)
          .join("\n");
        decorations.push({
          range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
          options: {
            glyphMarginClassName: "mopsa-safe-glyph",
            glyphMarginHoverMessage: { value: `**Proved safe**\n\n${list}` },
          },
        });
      }
    }

    // Local soundness assumptions: dotted blue, the results hold only if
    // they are acceptable.
    for (const a of assumptions) {
      const r = a.range;
      if (!r?.start || !r.end || !inFile(r.start.file, codeFilePath)) continue;
      decorations.push({
        range: toRange({ start: r.start, end: r.end }),
        options: {
          inlineClassName: "mopsa-assumption-span",
          hoverMessage: {
            value: `**ℹ️ Assumption**\n\n${a.message}\n\nThe analysis is sound only under this hypothesis.`,
            isTrusted: false,
          },
          minimap: { color: "#60a5fa", position: 1 },
        },
      });
    }

    // Where a failed analysis stopped.
    const ps = panic?.range?.start;
    if (ps && inFile(ps.file, codeFilePath)) {
      decorations.push({
        range: {
          startLineNumber: ps.line,
          startColumn: 1,
          endLineNumber: ps.line,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: "mopsa-panic-line",
          hoverMessage: { value: "**✕ The analysis failed here**" },
          minimap: { color: "#f87171", position: 1 },
        },
      });
    }

    collectionRef.current?.clear();
    collectionRef.current = editor.createDecorationsCollection(decorations);
  }, [checks, assumptions, panic, showSafe, codeFilePath, editorRef, mountKey]);
}
