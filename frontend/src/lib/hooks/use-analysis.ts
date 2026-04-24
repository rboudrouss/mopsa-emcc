import { useMutation } from '@tanstack/react-query';
import { analyzeJson, computeOptionsFlags } from '../mopsa-client';
import { useAppStore } from '../store';

export function useAnalysis() {
  const optionValues = useAppStore((s) => s.optionValues);
  const setAnalysisResult = useAppStore((s) => s.setAnalysisResult);

  const mutation = useMutation({
    mutationFn: () => {
      const flags = [
        ...computeOptionsFlags(optionValues),
        ...(optionValues['__raw']
          ? String(optionValues['__raw']).trim().split(/\s+/).filter(Boolean)
          : []),
      ];
      return analyzeJson(flags);
    },
    onSuccess: setAnalysisResult,
  });

  return {
    run: () => mutation.mutate(),
    isAnalyzing: mutation.isPending,
    error: mutation.error,
  };
}
