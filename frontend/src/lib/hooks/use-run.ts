import { useAnalysis } from "./use-analysis";
import { useAppStore } from "../store";

/**
 * Single entry point for the Run button. Dispatches on the selected engine:
 *   - automatic  → batch analysis (request/response)
 *   - interactive / dap → (re)start a live session; the terminal/debug
 *     component in the right panel watches `sessionNonce` and launches it.
 */
export function useRun() {
  const { run: runBatch, isAnalyzing } = useAnalysis();
  const requestSessionStart = useAppStore((s) => s.requestSessionStart);

  const run = () => {
    const engine =
      (useAppStore.getState().optionValues["-engine"] as string) ?? "automatic";
    if (engine === "automatic") runBatch();
    else requestSessionStart();
  };

  return { run, isAnalyzing };
}
