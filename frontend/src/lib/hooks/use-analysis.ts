import { useMutation } from '@tanstack/react-query';
import { analyzeJson, computeOptionsFlags } from '../mopsa-client';
import { useAppStore } from '../store';
import { getAllFilePaths } from '../tree';

export function useAnalysis() {
  const setAnalysisResult = useAppStore((s) => s.setAnalysisResult);

  const mutation = useMutation({
    mutationFn: () => {
      const { optionValues, fileTree, lang, crossLanguage, pyEntryPoint } = useAppStore.getState();

      const flags = [
        ...computeOptionsFlags(optionValues),
        ...(optionValues['__raw']
          ? String(optionValues['__raw']).trim().split(/\s+/).filter(Boolean)
          : []),
      ];

      const activeCodePath = mopsaJs.getCodeFilePath()[1];
      const activeExt = activeCodePath.split('.').pop() ?? '';

      const allFiles = getAllFilePaths(fileTree).map(({ path }) => '/' + path);

      if (crossLanguage) {
        // Entry point must be a .py file
        const entryPoint = pyEntryPoint ?? (activeCodePath.endsWith('.py') ? activeCodePath : null);
        if (!entryPoint) return Promise.resolve({ raw: '', parsed: null, durationMs: 0 });

        const cFiles = allFiles.filter((p) => p.endsWith('.c') || p.endsWith('.h'));
        // Pass C/H files first so the worker can build mopsa.db, then the py entry point last
        return analyzeJson([...flags, ...cFiles, entryPoint]);
      }

      if (lang === 'python') {
        const entryPoint = pyEntryPoint ?? activeCodePath;
        if (!entryPoint.endsWith('.py')) return Promise.resolve({ raw: '', parsed: null, durationMs: 0 });

        // Other .py files go into the virtual FS via extraFiles (already written by the editor),
        // but we only pass the entry point as a CLI arg — Mopsa follows imports automatically.
        return analyzeJson([...flags, entryPoint]);
      }

      if (!['c', 'h', 'u'].includes(activeExt)) return Promise.resolve({ raw: '', parsed: null, durationMs: 0 });

      const effectiveLang = activeExt === 'h' ? 'c' : lang;

      if (effectiveLang !== 'c') {
        return analyzeJson([...flags, activeCodePath]);
      }

      const extraSourceFiles = allFiles.filter((p) => {
        if (p === activeCodePath) return false;
        return p.endsWith('.c');
      });

      return analyzeJson([...flags, ...extraSourceFiles, ...(activeExt === "h" ? [] : [activeCodePath])]);
    },
    onSuccess: setAnalysisResult,
  });

  return {
    run: () => mutation.mutate(),
    isAnalyzing: mutation.isPending,
    error: mutation.error,
  };
}
