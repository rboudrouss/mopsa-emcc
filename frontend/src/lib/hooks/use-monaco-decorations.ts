import type * as Monaco from "monaco-editor";
import { useEffect, useRef } from "react";
import type { CheckItem } from "../types";
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

    collectionRef.current?.clear();
    collectionRef.current = editor.createDecorationsCollection(decorations);
  }, [checks, codeFilePath, editorRef, mountKey]);
}
