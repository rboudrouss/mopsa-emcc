import { computeOptionsFlags } from "./mopsa-client";
import { useAppStore } from "./store";
import {
  getActiveAnalysisMode,
  getAllFilePaths,
  getWorkspaceForFile,
} from "./tree";

/**
 * Build the full Mopsa argv (option flags + the files to analyse) from the
 * current store state. Shared by the batch path (useAnalysis) and the
 * interactive/DAP session path so both produce identical arguments.
 *
 * Returns null when there is nothing valid to run (e.g. no Python entry point).
 * The result does NOT include `-engine`; callers add it as appropriate (the
 * worker appends it for sessions).
 */
export function computeAnalysisArgs(): string[] | null {
  const { optionValues, fileTree, lang, pyEntryPoint, activeFile } =
    useAppStore.getState();

  const isMultilang =
    getActiveAnalysisMode({ fileTree, activeFile, lang }) === "multilanguage";

  const workspacePath = activeFile
    ? getWorkspaceForFile(fileTree, activeFile)
    : null;

  const flags = [
    ...(workspacePath ? ["-working-dir", "/" + workspacePath] : []),
    ...computeOptionsFlags(optionValues),
    ...(optionValues["__raw"]
      ? String(optionValues["__raw"]).trim().split(/\s+/).filter(Boolean)
      : []),
    // -engine is UI-only here; it is applied via the engine routing, not as a flag.
  ].filter((f) => !f.startsWith("-engine"));

  const activeCodePath = mopsaJs.getCodeFilePath()[1];
  const activeExt = activeCodePath.split(".").pop() ?? "";

  const allFiles = getAllFilePaths(fileTree).map(({ path }) => "/" + path);

  // When a workspace is active, restrict analysis to files inside it.
  const workspacePrefix = workspacePath ? "/" + workspacePath + "/" : null;
  const scopedFiles = workspacePrefix
    ? allFiles.filter((p) => p.startsWith(workspacePrefix))
    : allFiles;

  if (isMultilang) {
    const scopedPyFiles = scopedFiles.filter((p) => p.endsWith(".py"));
    const entryPoint =
      pyEntryPoint ??
      (activeCodePath.endsWith(".py") ? activeCodePath : null) ??
      (scopedPyFiles.length > 0 ? scopedPyFiles[scopedPyFiles.length - 1] : null);
    if (!entryPoint) return null;

    const cFiles = scopedFiles.filter(
      (p) => p.endsWith(".c") || p.endsWith(".h"),
    );
    // C/H files first (so the worker builds mopsa.db), then the py entry point.
    return [...flags, ...cFiles, entryPoint];
  }

  if (lang === "python") {
    const entryPoint = pyEntryPoint ?? activeCodePath;
    if (!entryPoint.endsWith(".py")) return null;
    return [...flags, entryPoint];
  }

  if (!["c", "h", "u"].includes(activeExt)) return null;

  const effectiveLang = activeExt === "h" ? "c" : lang;

  if (effectiveLang !== "c") {
    return [...flags, activeCodePath];
  }

  const extraSourceFiles = scopedFiles.filter(
    (p) => p !== activeCodePath && p.endsWith(".c"),
  );

  return [
    ...flags,
    ...extraSourceFiles,
    ...(activeExt === "h" ? [] : [activeCodePath]),
  ];
}
