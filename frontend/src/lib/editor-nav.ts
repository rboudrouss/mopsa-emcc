import { create } from "zustand";
import { useAppStore } from "./store";
import { getAllFilePaths, getWorkspaceForFile } from "./tree";

/**
 * Editor navigation state shared between the code editor and the panels
 * that point into the code (States panel, call stacks): the line under the
 * cursor, and one-shot requests to reveal a line. Runtime only.
 */
interface EditorNav {
  /** Cursor line in the active file (1-based), null before any editor. */
  cursorLine: number | null;
  setCursorLine: (line: number | null) => void;
  /** Consumed by the editor: reveal + put the cursor on `line`. */
  revealRequest: { line: number; nonce: number } | null;
  requestReveal: (line: number) => void;
}

export const useEditorNav = create<EditorNav>((set) => ({
  cursorLine: null,
  setCursorLine: (line) => set({ cursorLine: line }),
  revealRequest: null,
  requestReveal: (line) =>
    set((s) => ({
      revealRequest: { line, nonce: (s.revealRequest?.nonce ?? 0) + 1 },
    })),
}));

/**
 * Tree node id of a file reported by Mopsa: absolute (`/c-single/main.c`),
 * or relative to the analysis directory (`./main.c`, `main.c`), resolved
 * against the active file's workspace first.
 */
export function findFileByMopsaPath(file: string): string | null {
  const { fileTree, activeFile } = useAppStore.getState();
  const all = getAllFilePaths(fileTree);
  const clean = file.replace(/^\.\//, "");
  if (clean.startsWith("/")) {
    const hit = all.find((f) => "/" + f.path === clean);
    if (hit) return hit.id;
  }
  const ws = activeFile ? getWorkspaceForFile(fileTree, activeFile) : null;
  const candidates = all.filter(
    (f) => f.path === clean || f.path.endsWith("/" + clean),
  );
  const inWs = ws
    ? candidates.find((f) => f.path.startsWith(ws + "/"))
    : undefined;
  return (inWs ?? candidates[0])?.id ?? null;
}

/** Opens `file` (as reported by Mopsa) and reveals `line` in the editor. */
export function revealInEditor(file: string | null, line: number): void {
  const app = useAppStore.getState();
  if (file) {
    const id = findFileByMopsaPath(file);
    if (id && id !== app.activeFile) app.selectFile(id);
  }
  if (app.activeTab !== "source") app.setActiveTab("source");
  useEditorNav.getState().requestReveal(line);
}
