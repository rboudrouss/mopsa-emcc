import { create } from "zustand";
import { useAppStore } from "./store";
import { getAllFilePaths, getWorkspaceForFile } from "./tree";

export type InlineValuesMode = "off" | "cursor" | "all" | "before" | "after";

const VIEW_KEY = "mopsa-editor-view";

type View = {
  showCoverage: boolean;
  inlineValues: InlineValuesMode;
  showSafe: boolean;
};

const DEFAULT_VIEW: View = {
  showCoverage: true,
  inlineValues: "all",
  showSafe: false,
};

function loadView(): View {
  try {
    return {
      ...DEFAULT_VIEW,
      ...JSON.parse(localStorage.getItem(VIEW_KEY) ?? "{}"),
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

/**
 * Editor navigation state shared between the code editor and the panels
 * that point into the code (States panel, call stacks): the line under the
 * cursor, one-shot requests to reveal a line, and the settings of the
 * editor's envdb overlays (persisted).
 */
interface EditorNav {
  /** Gutter marks of the lines the analysis reached / found unreachable. */
  showCoverage: boolean;
  setShowCoverage: (on: boolean) => void;
  /** Abstract values shown at the end of code lines. */
  inlineValues: InlineValuesMode;
  setInlineValues: (mode: InlineValuesMode) => void;
  /** Gutter marks of the checks proved safe. */
  showSafe: boolean;
  setShowSafe: (on: boolean) => void;
  /** Cursor line in the active file (1-based), null before any editor. */
  cursorLine: number | null;
  setCursorLine: (line: number | null) => void;
  /** Consumed by the editor: reveal + put the cursor on `line`. */
  revealRequest: { line: number; nonce: number } | null;
  requestReveal: (line: number) => void;
}

function saveView(s: View) {
  try {
    const { showCoverage, inlineValues, showSafe } = s;
    localStorage.setItem(
      VIEW_KEY,
      JSON.stringify({ showCoverage, inlineValues, showSafe }),
    );
  } catch {
    /* no localStorage */
  }
}

export const useEditorNav = create<EditorNav>((set, get) => ({
  ...loadView(),
  setShowCoverage: (on) => {
    set({ showCoverage: on });
    saveView(get());
  },
  setInlineValues: (mode) => {
    set({ inlineValues: mode });
    saveView(get());
  },
  setShowSafe: (on) => {
    set({ showSafe: on });
    saveView(get());
  },
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
