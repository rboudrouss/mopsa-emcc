import { useMutation } from "@tanstack/react-query";
import { analyzeJson } from "../mopsa-client";
import { computeAnalysisArgs } from "../analysis-args";
import { useAppStore } from "../store";

export function useAnalysis() {
  const setAnalysisResult = useAppStore((s) => s.setAnalysisResult);

  const mutation = useMutation({
    mutationFn: () => {
      const args = computeAnalysisArgs();
      if (!args) return Promise.resolve({ raw: "", parsed: null, durationMs: 0 });
      return analyzeJson(args);
    },
    // null ⇒ this run was superseded by a newer one; keep the current result.
    onSuccess: (r) => {
      if (r) setAnalysisResult(r);
    },
  });

  return {
    run: () => mutation.mutate(),
    isAnalyzing: mutation.isPending,
    error: mutation.error,
  };
}
