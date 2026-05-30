import type * as Monaco from "monaco-editor";
import { useEffect, useRef } from "react";
import { useDebugStore } from "../store-debug";

function basename(p: string): string {
  return p.split("/").pop() ?? p;
}

/**
 * Wires the Monaco glyph margin to DAP breakpoints (click to toggle) and
 * highlights the current stop line. Active only for `-engine=dap`.
 */
export function useDebugBreakpoints(
  editorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>,
  monacoRef: React.RefObject<typeof Monaco | null>,
  codeFilePath: string,
  enabled: boolean,
  mountKey: number,
) {
  const breakpoints = useDebugStore((s) => s.breakpoints);
  const stopLocation = useDebugStore((s) => s.stopLocation);
  const toggleBreakpoint = useDebugStore((s) => s.toggleBreakpoint);
  const collectionRef =
    useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);

  // Toggle a breakpoint when the glyph margin is clicked.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !enabled) return;
    const sub = editor.onMouseDown((e) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        const line = e.target.position?.lineNumber;
        if (line) toggleBreakpoint(codeFilePath, line);
      }
    });
    return () => sub.dispose();
  }, [editorRef, monacoRef, codeFilePath, enabled, mountKey, toggleBreakpoint]);

  // Render breakpoint dots + current stop line.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const decos: Monaco.editor.IModelDeltaDecoration[] = [];

    if (enabled) {
      for (const line of breakpoints[codeFilePath] ?? []) {
        decos.push({
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: false,
            glyphMarginClassName: "mopsa-bp-glyph",
            glyphMarginHoverMessage: { value: "Breakpoint" },
          },
        });
      }

      if (stopLocation && basename(stopLocation.path) === basename(codeFilePath)) {
        decos.push({
          range: new monaco.Range(stopLocation.line, 1, stopLocation.line, 1),
          options: {
            isWholeLine: true,
            className: "mopsa-stopline",
            glyphMarginClassName: "mopsa-stop-glyph",
          },
        });
      }
    }

    collectionRef.current?.clear();
    collectionRef.current = editor.createDecorationsCollection(decos);
  }, [breakpoints, stopLocation, codeFilePath, enabled, mountKey, editorRef, monacoRef]);
}
