import { useMutation } from '@tanstack/react-query';
import { analyzeJson, computeOptionsFlags, FILE_EXTENSIONS } from '../mopsa-client';
import { useAppStore } from '../store';
import { getAllFilePaths } from '../tree';

export function useAnalysis() {
  const setAnalysisResult = useAppStore((s) => s.setAnalysisResult);

  const mutation = useMutation({
    mutationFn: () => {
      // Read current state at call time to avoid stale closures
      const { optionValues, fileTree, activeFile, lang } = useAppStore.getState();

      const flags = [
        ...computeOptionsFlags(optionValues),
        ...(optionValues['__raw']
          ? String(optionValues['__raw']).trim().split(/\s+/).filter(Boolean)
          : []),
      ];

      const activeCodePath = mopsaJs.getCodeFilePath()[1];
      const activeExt = activeCodePath.split('.').pop() ?? '';
      if (!['c', 'h', 'py', 'u'].includes(activeExt)) return Promise.resolve({ raw: '', parsed: null, durationMs: 0 });

      const activeIsHeader = activeExt === 'h';
      // Treat .h as C for the purpose of choosing which siblings to include.
      const effectiveLang = activeIsHeader ? 'c' : lang;
      const sourceExt = FILE_EXTENSIONS[effectiveLang];
      const extraSourceFiles = getAllFilePaths(fileTree)
        .filter(({ id, path }) => {
          if (id === activeFile || '/' + path === activeCodePath) return false;
          if (path.endsWith('.' + sourceExt)) return true;
          if (effectiveLang === 'c' && path.endsWith('.h')) return true;
          return false;
        })
        .map(({ path }) => '/' + path);

      return analyzeJson([...flags, ...extraSourceFiles]);
    },
    onSuccess: setAnalysisResult,
  });

  return {
    run: () => mutation.mutate(),
    isAnalyzing: mutation.isPending,
    error: mutation.error,
  };
}
