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

/** Single entry point for the Run button: the batch analysis, unless the
 *  selected backend can't run it. */
export function useRun() {
  const { run: runBatch, isAnalyzing } = useAnalysis();

  const run = () => {
    if (checkBackendSupport()) return;
    runBatch();
  };

  return { run, isAnalyzing };
}
