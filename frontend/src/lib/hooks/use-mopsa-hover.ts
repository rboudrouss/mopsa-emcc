import { useEffect } from "react";
import type * as MonacoNS from "monaco-editor";
import { envEngine } from "../envdb/env-engine";
import { formatHover } from "../envdb/hover-format";
import { getCodeFilePath } from "../mopsa-client";

// Monaco is a page-global: register the provider once, whatever the number
// of editor mounts. (Hover providers are per-language, not per-editor.)
let registered = false;

/**
 * Hover-for-abstract-state: hovering an identifier in the code editor asks
 * the background envdb engine for the abstract environment Mopsa computed
 * at that line, and shows the matching variable(s). Works in every engine
 * mode (scan / interactive) — the hover session is independent.
 */
export function useMopsaHover(
  monacoRef: React.RefObject<typeof MonacoNS | null>,
  mountKey: number,
) {
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco || registered) return;
    registered = true;
    envEngine.init();

    monaco.languages.registerHoverProvider(["c", "python"], {
      provideHover: async (model, position, token) => {
        const word = model.getWordAtPosition(position);
        if (!word) return null;
        // The visible model is always the active code file.
        const file = getCodeFilePath();
        const res = await envEngine.getEnvironment(
          file,
          position.lineNumber,
        );
        if (token.isCancellationRequested) return null;
        const contents = formatHover(res, word.word, position.lineNumber);
        if (!contents) return null;
        return {
          range: new monaco.Range(
            position.lineNumber,
            word.startColumn,
            position.lineNumber,
            word.endColumn,
          ),
          contents,
        };
      },
    });
  }, [monacoRef, mountKey]);
}
