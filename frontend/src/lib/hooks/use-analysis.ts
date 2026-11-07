import { useMutation } from "@tanstack/react-query";
import { analyzeJson } from "../mopsa-client";
import { computeAnalysisArgs } from "../analysis-args";
import { useAppStore } from "../store";
import { DEFAULT_OPTION_VALUES } from "../options-schema";
import { snapshotRun, useRunCompare } from "../run-compare";
import { getWorkspaceForFile } from "../tree";
import { PROGRESS_FLAGS, useProgress } from "../progress";
import { getBackend } from "../backend";

function currentSnapshot() {
  const s = useAppStore.getState();
  const changed = Object.entries(s.optionValues).filter(
    ([flag, v]) =>
      !flag.startsWith("__") && v !== undefined && v !== DEFAULT_OPTION_VALUES[flag],
  ).length;
  const config = s.configDirty ? "custom config" : s.configPreset;
  const label =
    config + (changed ? `, ${changed} option${changed > 1 ? "s" : ""}` : "");
  const scope = s.activeFile
    ? (getWorkspaceForFile(s.fileTree, s.activeFile) ?? s.activeFile)
    : "";
  return snapshotRun(s.checks, s.analysisTime, label, scope);
}

export function useAnalysis() {
  const setAnalysisResult = useAppStore((s) => s.setAnalysisResult);

  const mutation = useMutation({
    mutationFn: () => {
      const args = computeAnalysisArgs();
      if (!args) return Promise.resolve({ raw: "", parsed: null, durationMs: 0 });
      const progress = useProgress.getState();
      progress.start();
      if (getBackend() !== "wasm") return analyzeJson(args);
      return analyzeJson([...PROGRESS_FLAGS, ...args], progress.update);
    },
    // null ⇒ this run was superseded by a newer one; keep the current result.
    onSuccess: (r) => {
      if (!r) return;
      setAnalysisResult(r);
      const s = useAppStore.getState();
      if (s.analysisSuccess) useRunCompare.getState().record(currentSnapshot());
    },
  });

  return {
    run: () => mutation.mutate(),
    isAnalyzing: mutation.isPending,
    error: mutation.error,
  };
}
