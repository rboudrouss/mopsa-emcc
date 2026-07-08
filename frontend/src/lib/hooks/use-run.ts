import { useAnalysis } from "./use-analysis";
import { useAppStore } from "../store";
import { getActiveAnalysisMode } from "../tree";
import { unsupportedReason } from "../backend";

/**
 * Returns the reason the current run is unsupported by the selected backend
 * (e.g. C on the js_of_ocaml backend), or null. When blocked, the reason is
 * also published to the store (`backendNotice`) so the right panel can show
 * a clear message instead of an obscure failure.
 */
export function checkBackendSupport(): string | null {
  const state = useAppStore.getState();
  const mode = getActiveAnalysisMode({
    fileTree: state.fileTree,
    activeFile: state.activeFile,
    lang: state.lang,
  });
  const reason = unsupportedReason(state.lang, mode === "multilanguage");
  state.setBackendNotice(reason);
  return reason;
}

/**
 * Single entry point for the Run button. Dispatches on the selected engine:
 *   - automatic  → batch analysis (request/response)
 *   - interactive / dap → (re)start a live session; the terminal/debug
 *     component in the right panel watches `sessionNonce` and launches it.
 *
 * Runs unsupported by the selected backend are intercepted here (and in the
 * session components, which can also be started by auto-run).
 */
export function useRun() {
  const { run: runBatch, isAnalyzing } = useAnalysis();
  const requestSessionStart = useAppStore((s) => s.requestSessionStart);

  const run = () => {
    if (checkBackendSupport()) return;

    const engine =
      (useAppStore.getState().optionValues["-engine"] as string) ??
      "automatic";
    if (engine === "automatic") runBatch();
    else requestSessionStart();
  };

  return { run, isAnalyzing };
}
