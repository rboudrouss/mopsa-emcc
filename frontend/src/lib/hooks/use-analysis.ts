import { useMutation } from '@tanstack/react-query';
import { analyzeJson, computeOptionsFlags } from '../mopsa-client';
import { useAppStore } from '../store';
import { getAllFilePaths, getWorkspaceForFile } from '../tree';

export function useAnalysis() {
  const setAnalysisResult = useAppStore((s) => s.setAnalysisResult);

  const mutation = useMutation({
    mutationFn: () => {
      const { optionValues, fileTree, lang, crossLanguage, pyEntryPoint, activeFile } = useAppStore.getState();

      const workspacePath = activeFile ? getWorkspaceForFile(fileTree, activeFile) : null;

      const flags = [
        ...(workspacePath ? ['-working-dir', '/' + workspacePath] : []),
        ...computeOptionsFlags(optionValues),
        ...(optionValues['__raw']
          ? String(optionValues['__raw']).trim().split(/\s+/).filter(Boolean)
          : []),
      ];

      const activeCodePath = mopsaJs.getCodeFilePath()[1];
      const activeExt = activeCodePath.split('.').pop() ?? '';

      const allFiles = getAllFilePaths(fileTree).map(({ path }) => '/' + path);

      // When a workspace is active, restrict analysis to files inside it
      const workspacePrefix = workspacePath ? '/' + workspacePath + '/' : null;
      const scopedFiles = workspacePrefix
        ? allFiles.filter((p) => p.startsWith(workspacePrefix))
        : allFiles;

      if (crossLanguage) {
        // Entry point must be a .py file
        const entryPoint = pyEntryPoint ?? (activeCodePath.endsWith('.py') ? activeCodePath : null);
        if (!entryPoint) return Promise.resolve({ raw: '', parsed: null, durationMs: 0 });

        const cFiles = scopedFiles.filter((p) => p.endsWith('.c') || p.endsWith('.h'));
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

      const extraSourceFiles = scopedFiles.filter((p) => {
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
