import { create } from "zustand";
import {
  DEFAULT_CODE,
  MULTIFILE_C,
  MULTILANG_CPYTHON,
  extractPreJson,
  parseConfigText,
  readFile,
  writeFile,
  deleteFile,
  setCodeFilePath,
} from "./mopsa-client";
import { DEFAULT_OPTION_VALUES } from "./options-schema";
import { useDebugStore } from "./store-debug";
import { loadAndRestoreState, saveState } from "./persistence";
import { getLanguageFromFileExtension } from "./index";
import {
  genId,
  insertNode,
  removeNodes,
  findById,
  getNodePath,
  renameNodeById,
  moveNodesInTree,
  getDescendantFiles,
  findFirstFile,
  sortNodes,
  getSiblings,
  getChildrenOf,
  uniqueNameInLevel,
  toggleWorkspaceById,
  getActiveAnalysisMode,
  setWorkspaceModeById,
} from "./tree";
import type {
  ActivePanel,
  ActiveTab,
  AnalysisResult,
  CheckItem,
  FileTreeNode,
  SavedConfig,
  SupportedLanguage,
  WorkspaceMode,
} from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildInitialTree(): FileTreeNode[] {
  // Order is intentional: c-single first so findFirstFile picks it as active.
  return [
    {
      id: genId(),
      name: "c-single",
      isWorkspace: true,
      children: [{ id: genId(), name: "example.c" }],
    },
    {
      id: genId(),
      name: "c-multifile",
      isWorkspace: true,
      children: [
        { id: genId(), name: "main.c" },
        { id: genId(), name: "utils.c" },
      ],
    },
    {
      id: genId(),
      name: "python",
      isWorkspace: true,
      children: [{ id: genId(), name: "example.py" }],
    },
    {
      id: genId(),
      name: "c-python",
      isWorkspace: true,
      children: [
        { id: genId(), name: "main.py" },
        { id: genId(), name: "mymod.c" },
      ],
    },
    {
      id: genId(),
      name: "universal",
      isWorkspace: true,
      children: [{ id: genId(), name: "example.u" }],
    },
  ];
}

function pickMultilangPreset(presets: shareData | null): SavedConfig | null {
  const pythonConfigs = presets?.configs.python;
  if (!pythonConfigs) return null;
  const xlKey =
    Object.keys(pythonConfigs).find((k) => k === "multilanguage.json") ??
    Object.keys(pythonConfigs).find((k) =>
      k.toLowerCase().includes("multilanguage"),
    ) ??
    Object.keys(pythonConfigs)[0];
  if (!xlKey) return null;
  const text = pythonConfigs[xlKey];
  if (text === undefined) return null;
  return { preset: xlKey, text, dirty: false };
}

// Unified config-bucket swap. Computes what to update when the effective analysis
// mode/lang changes (e.g. selecting a file in a different workspace, toggling the
// force flag, overriding a workspace mode). Saves the currently displayed config
// back to its bucket (configByLang[oldLang] or configXL), then loads the target
// bucket (configByLang[newLang] or configXL, with preset fallback).
// Side effect: calls mopsaJs.setConfig when text changes.
function computeConfigBucketSwap(
  state: AppStore,
  newMode: WorkspaceMode,
  newLang: SupportedLanguage,
): Partial<AppStore> {
  const oldMode = getActiveAnalysisMode({
    fileTree: state.fileTree,
    activeFile: state.activeFile,
    lang: state.lang,
  });
  const oldIsXL = oldMode === "multilanguage";
  const newIsXL = newMode === "multilanguage";

  if (oldIsXL === newIsXL && state.lang === newLang) return {};

  const currentSaved: SavedConfig = {
    preset: state.configPreset,
    text: state.configText,
    dirty: state.configDirty,
  };

  const updates: Partial<AppStore> = {};
  let configByLang = state.configByLang;

  if (oldIsXL) {
    updates.configXL = currentSaved;
  } else {
    configByLang = { ...configByLang, [state.lang]: currentSaved };
    updates.configByLang = configByLang;
  }

  // Load target bucket
  let target: SavedConfig | null = null;
  if (newIsXL) {
    target = state.configXL ?? pickMultilangPreset(state.presets);
  } else {
    target = configByLang[newLang] ?? null;
    if (!target) {
      const langConfigs =
        state.presets?.configs[newLang as "c" | "python" | "universal" | "cfg"];
      const defaultText = langConfigs?.["default.json"];
      if (defaultText) {
        target = { preset: "default.json", text: defaultText, dirty: false };
      }
    }
  }

  if (target) {
    if (target.text !== state.configText) mopsaJs.setConfig(target.text);
    updates.configText = target.text;
    updates.configPreset = target.preset;
    updates.configDirty = target.dirty;
  }

  return updates;
}

// ── Store interface ───────────────────────────────────────────────────────────

interface AppStore {
  // ── Code / config ────────────────────────────────────────────────────────
  lang: SupportedLanguage;
  code: string;
  configText: string;
  configPreset: string;
  configDirty: boolean;

  // ── Per-language code memory ─────────────────────────────────────────────
  codeByLang: Partial<Record<SupportedLanguage, string>>;

  // ── Config memory ────────────────────────────────────────────────────────
  configByLang: Partial<Record<SupportedLanguage, SavedConfig>>;
  configXL: SavedConfig | null;

  // ── Presets ──────────────────────────────────────────────────────────────
  presets: shareData | null;

  // ── Analysis results ─────────────────────────────────────────────────────
  checks: CheckItem[];
  warnings: string;
  rawOutput: string;
  selectivity: string | null;
  analysisTime: number | null;
  analysisSuccess: boolean | null;
  analysisError: string | null;

  // ── Layout ───────────────────────────────────────────────────────────────
  activePanel: ActivePanel;
  activeTab: ActiveTab;

  // ── File tree ────────────────────────────────────────────────────────────
  fileTree: FileTreeNode[];
  activeFile: string | null; // UUID of selected file node

  // ── Options ──────────────────────────────────────────────────────────────
  optionValues: Record<string, unknown>;
  pyEntryPoint: string | null; // null = auto (active file)
  openCategories: Record<string, boolean>; // expanded options categories

  // ── Custom configs (saved per language/mode) ─────────────────────────────
  customConfigs: Partial<Record<string, string>>;

  // ── Auto-run ─────────────────────────────────────────────────────────────
  autoRun: boolean;

  // ── Interactive / DAP session (runtime only, not persisted) ──────────────
  // Bumped each time the user asks to (re)start a session for the current
  // engine; the terminal/debug component watches it to launch the run.
  sessionNonce: number;

  // ── Actions ──────────────────────────────────────────────────────────────
  setPresets: (presets: shareData) => void;
  toggleAutoRun: () => void;
  requestSessionStart: () => void;
  setCode: (code: string) => void;
  setConfigText: (text: string, dirty?: boolean) => void;
  applyPreset: (name: string, text: string) => void;
  applyCustom: (key: string) => void;
  setAnalysisResult: (r: AnalysisResult) => void;
  setLang: (lang: SupportedLanguage, defaultConfig: string) => void;
  togglePanel: (panel: Exclude<ActivePanel, null>) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setOptionValue: (flag: string, value: unknown) => void;
  resetOption: (flag: string) => void;
  toggleCategory: (group: string) => void;
  setPyEntryPoint: (path: string | null) => void;
  setWorkspaceMode: (id: string, mode: WorkspaceMode | undefined) => void;

  // ── File tree actions ────────────────────────────────────────────────────
  selectFile: (id: string) => void;
  createFileNode: (parentId: string | null) => string;
  createFolderNode: (parentId: string | null) => string;
  deleteNodes: (ids: string[]) => void;
  moveNodes: (dragIds: string[], parentId: string | null) => void;
  renameNode: (id: string, newName: string) => boolean;
  importFiles: (
    files: { path: string; content: string }[],
    parentId?: string | null,
  ) => void;
  toggleWorkspace: (id: string) => void;
  createWorkspaceNode: (parentId: string | null) => string;
}

// ── Sync initial code into workspace filesystem ───────────────────────────────

setCodeFilePath("/c-single/example.c");
mopsaJs.setCode(DEFAULT_CODE.c);
mopsaJs.writeFile("/c-multifile/main.c", MULTIFILE_C["main.c"]);
mopsaJs.writeFile("/c-multifile/utils.c", MULTIFILE_C["utils.c"]);
mopsaJs.writeFile("/python/example.py", DEFAULT_CODE.python);
mopsaJs.writeFile("/c-python/main.py", MULTILANG_CPYTHON["main.py"]);
mopsaJs.writeFile("/c-python/mymod.c", MULTILANG_CPYTHON["mymod.c"]);
mopsaJs.writeFile("/universal/example.u", DEFAULT_CODE.universal);

// ── Restore from localStorage (overwrites WASM defaults if saved state exists) ─

const _restored = loadAndRestoreState();

// ── Initial tree ──────────────────────────────────────────────────────────────

const _initialTree = _restored?.fileTree ?? buildInitialTree();
const _initialActiveFile = _restored?.activeFile ?? findFirstFile(_initialTree);

// ── Store ─────────────────────────────────────────────────────────────────────

// Analysis results become stale the moment options or config change, so we
// wipe them (which also clears the editor alarm decorations) on every such
// edit. Re-runs (manual or auto) repopulate them.
const CLEARED_ANALYSIS = {
  checks: [] as CheckItem[],
  warnings: "",
  rawOutput: "",
  selectivity: null,
  analysisTime: null,
  analysisSuccess: null,
  analysisError: null,
};

export const useAppStore = create<AppStore>((set, get) => ({
  lang: _restored?.lang ?? "c",
  code: _restored?.code ?? DEFAULT_CODE.c,
  configText: _restored?.configText ?? "",
  configPreset: _restored?.configPreset ?? "default.json",
  configDirty: _restored?.configDirty ?? false,
  codeByLang: _restored?.codeByLang ?? {},
  configByLang: _restored?.configByLang ?? {},
  configXL: _restored?.configXL ?? null,
  customConfigs: _restored?.customConfigs ?? {},
  presets: null,
  checks: [],
  warnings: "",
  rawOutput: "",
  selectivity: null,
  analysisTime: null,
  analysisSuccess: null,
  analysisError: null,
  activePanel: _restored?.activePanel ?? "files",
  activeTab: "source",
  optionValues: _restored?.optionValues ?? { ...DEFAULT_OPTION_VALUES },
  openCategories: _restored?.openCategories ?? {},
  pyEntryPoint: _restored?.pyEntryPoint ?? null,
  fileTree: _initialTree,
  activeFile: _initialActiveFile,
  autoRun: _restored?.autoRun ?? true,
  sessionNonce: 0,

  // ── Presets ────────────────────────────────────────────────────────────
  setPresets: (presets) => set({ presets }),
  toggleAutoRun: () => set((s) => ({ autoRun: !s.autoRun })),
  requestSessionStart: () =>
    set((s) => ({ sessionNonce: s.sessionNonce + 1 })),

  // ── Code / config ──────────────────────────────────────────────────────
  setCode: (code) => {
    mopsaJs.setCode(code.endsWith("\n") ? code : code + "\n");
    // A code edit invalidates the current results / alarms (batch + DAP).
    useDebugStore.getState().clearAlarms();
    set({ code, ...CLEARED_ANALYSIS });
  },

  setConfigText: (text, dirty = true) => {
    const state = get();
    const {
      lang,
      configPreset,
      configByLang,
      configXL,
      customConfigs,
      configText: currentText,
    } = state;
    // If the content hasn't meaningfully changed, ignore (handles Monaco's programmatic echo).
    if (dirty && text.trim() === currentText.trim()) return;
    // A real config edit invalidates current DAP alarms (batch is cleared below).
    if (dirty) useDebugStore.getState().clearAlarms();
    const isXL =
      getActiveAnalysisMode({
        fileTree: state.fileTree,
        activeFile: state.activeFile,
        lang,
      }) === "multilanguage";
    const key = isXL ? "multilanguage" : lang;
    let customUpdate: Partial<AppStore> = {};
    if (!dirty) {
      mopsaJs.setConfig(text);
    } else if (parseConfigText(text) !== null) {
      mopsaJs.setConfig(text);
      customUpdate = { customConfigs: { ...customConfigs, [key]: text } };
    }
    const saved: SavedConfig = { preset: configPreset, text, dirty };
    if (isXL) {
      set({
        configText: text,
        configDirty: dirty,
        configXL: { ...configXL, ...saved },
        ...customUpdate,
        ...(dirty ? CLEARED_ANALYSIS : {}),
      });
    } else {
      set({
        configText: text,
        configDirty: dirty,
        configByLang: { ...configByLang, [lang]: saved },
        ...customUpdate,
        ...(dirty ? CLEARED_ANALYSIS : {}),
      });
    }
  },

  applyCustom: (key) => {
    const state = get();
    const { customConfigs, lang, configByLang } = state;
    const text = customConfigs[key];
    if (!text) return;
    mopsaJs.setConfig(text);
    useDebugStore.getState().clearAlarms();
    const saved: SavedConfig = { preset: "custom", text, dirty: true };
    const isXL =
      getActiveAnalysisMode({
        fileTree: state.fileTree,
        activeFile: state.activeFile,
        lang,
      }) === "multilanguage";
    if (isXL) {
      set({
        configText: text,
        configPreset: "custom",
        configDirty: true,
        configXL: saved,
        ...CLEARED_ANALYSIS,
      });
    } else {
      set({
        configText: text,
        configPreset: "custom",
        configDirty: true,
        configByLang: { ...configByLang, [lang]: saved },
        ...CLEARED_ANALYSIS,
      });
    }
  },

  applyPreset: (name, text) => {
    const state = get();
    const { lang, configByLang } = state;
    mopsaJs.setConfig(text);
    useDebugStore.getState().clearAlarms();
    const saved: SavedConfig = { preset: name, text, dirty: false };
    const isXL =
      getActiveAnalysisMode({
        fileTree: state.fileTree,
        activeFile: state.activeFile,
        lang,
      }) === "multilanguage";
    if (isXL) {
      set({
        configText: text,
        configPreset: name,
        configDirty: false,
        configXL: saved,
        ...CLEARED_ANALYSIS,
      });
    } else {
      set({
        configText: text,
        configPreset: name,
        configDirty: false,
        configByLang: { ...configByLang, [lang]: saved },
        ...CLEARED_ANALYSIS,
      });
    }
  },

  setAnalysisResult: (r) => {
    // Text output is shown verbatim in a terminal; there's nothing to parse,
    // so don't surface "analysis failed" or the (irrelevant) results panel.
    if ((get().optionValues["-format"] ?? "json") === "text") {
      set({
        rawOutput: r.raw,
        checks: [],
        warnings: "",
        selectivity: null,
        analysisTime: r.durationMs / 1000,
        analysisSuccess: null,
        analysisError: null,
      });
      return;
    }
    const p = r.parsed;
    let error: string | null = null;
    if (!p) {
      error = r.raw ? "Could not parse analysis output" : null;
    } else if (!p.success) {
      error = p.exception ?? "Analysis failed";
    }
    set({
      rawOutput: r.raw,
      checks: p?.checks ?? [],
      warnings: extractPreJson(r.raw),
      selectivity: p?.selectivity ?? null,
      analysisTime: r.durationMs / 1000,
      analysisSuccess: p?.success ?? null,
      analysisError: error,
    });
  },

  setLang: (lang, defaultConfig) => {
    const current = get();
    const newMode = getActiveAnalysisMode({
      fileTree: current.fileTree,
      activeFile: current.activeFile,
      lang,
    });
    const swap = computeConfigBucketSwap(current, newMode, lang);
    // If the helper didn't produce anything for non-multilang (e.g. no preset/saved),
    // fall back to defaultConfig provided by the caller.
    if (newMode !== "multilanguage" && swap.configText === undefined) {
      mopsaJs.setConfig(defaultConfig);
      set({
        lang,
        configText: defaultConfig,
        configPreset: "default.json",
        configDirty: false,
        configByLang: {
          ...current.configByLang,
          [current.lang]: {
            preset: current.configPreset,
            text: current.configText,
            dirty: current.configDirty,
          },
        },
        checks: [],
        warnings: "",
        rawOutput: "",
        selectivity: null,
        analysisTime: null,
        analysisSuccess: null,
        analysisError: null,
      });
      return;
    }
    set({
      lang,
      ...swap,
      checks: [],
      warnings: "",
      rawOutput: "",
      selectivity: null,
      analysisTime: null,
      analysisSuccess: null,
      analysisError: null,
    });
  },

  togglePanel: (panel) => {
    set((s) => ({ activePanel: s.activePanel === panel ? null : panel }));
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setOptionValue: (flag, value) => {
    useDebugStore.getState().clearAlarms();
    set((s) => ({
      optionValues: { ...s.optionValues, [flag]: value },
      ...CLEARED_ANALYSIS,
    }));
  },

  resetOption: (flag) => {
    useDebugStore.getState().clearAlarms();
    set((s) => ({
      optionValues: { ...s.optionValues, [flag]: DEFAULT_OPTION_VALUES[flag] },
      ...CLEARED_ANALYSIS,
    }));
  },

  toggleCategory: (group) =>
    set((s) => ({
      openCategories: { ...s.openCategories, [group]: !s.openCategories[group] },
    })),

  setPyEntryPoint: (path) => set({ pyEntryPoint: path }),

  setWorkspaceMode: (id, mode) => {
    const state = get();
    const newTree = setWorkspaceModeById(state.fileTree, id, mode);
    const newMode = getActiveAnalysisMode({
      fileTree: newTree,
      activeFile: state.activeFile,
      lang: state.lang,
    });
    const swap = computeConfigBucketSwap(state, newMode, state.lang);
    set({ fileTree: newTree, ...swap });
  },

  // ── File tree actions ──────────────────────────────────────────────────

  selectFile: (id) => {
    const { fileTree } = get();
    const path = getNodePath(fileTree, id);
    if (!path) return;
    const wPath = "/" + path;

    const currentPath = mopsaJs.getCodeFilePath()[1];
    if (wPath === currentPath) {
      set({ activeFile: id, activeTab: "source" });
      return;
    }

    // 1. Read the new file's content BEFORE changing _codeFile, otherwise
    //    readFile(wPath) would match _codeFile and return the old _code.
    const newContent = readFile(wPath);

    // 2. Switch _codeFile.
    setCodeFilePath(wPath);

    // 3. Now that _codeFile has changed, write the old file's content into
    //    _extraFiles[currentPath] so it can be read back when switching back.
    writeFile(currentPath, mopsaJs.getCode());

    // 4. Set the new file as active code.
    mopsaJs.setCode(newContent);

    const ext = path.split(".").pop() ?? "";
    const newLang = getLanguageFromFileExtension(ext);
    const state = get();
    const newMode = getActiveAnalysisMode({
      fileTree: state.fileTree,
      activeFile: id,
      lang: newLang,
    });
    const configUpdates = computeConfigBucketSwap(state, newMode, newLang);

    set({
      activeFile: id,
      activeTab: "source",
      code: newContent,
      lang: newLang,
      ...configUpdates,
    });
  },

  createFileNode: (parentId) => {
    const { fileTree } = get();
    const id = genId();
    const siblings = getChildrenOf(fileTree, parentId);
    const name = uniqueNameInLevel(siblings, "new_file");
    const node: FileTreeNode = { id, name };
    const parentPath = parentId ? getNodePath(fileTree, parentId) : null;
    const filePath = parentPath ? `${parentPath}/${name}` : name;
    writeFile("/" + filePath, "");
    const newTree = sortNodes(insertNode(fileTree, parentId, node));
    set({ fileTree: newTree });
    return id;
  },

  createFolderNode: (parentId) => {
    const { fileTree } = get();
    const id = genId();
    const siblings = getChildrenOf(fileTree, parentId);
    const name = uniqueNameInLevel(siblings, "new_folder");
    const node: FileTreeNode = { id, name, children: [] };
    const newTree = sortNodes(insertNode(fileTree, parentId, node));
    set({ fileTree: newTree });
    return id;
  },

  deleteNodes: (ids) => {
    const { fileTree, activeFile } = get();
    const idSet = new Set(ids);

    // Delete all files under affected nodes from mopsaJs
    for (const id of ids) {
      const node = findById(fileTree, id);
      if (!node) continue;
      for (const file of getDescendantFiles(node)) {
        const path = getNodePath(fileTree, file.id);
        if (path) {
          try {
            deleteFile("/" + path);
          } catch {
            /* ignore */
          }
        }
      }
    }

    const newTree = removeNodes(fileTree, idSet);

    // If active file was deleted, select the first remaining file
    let newActiveFile = activeFile;
    if (activeFile && idSet.has(activeFile)) {
      newActiveFile = findFirstFile(newTree);
      if (newActiveFile) {
        const path = getNodePath(newTree, newActiveFile);
        if (path) {
          const content = readFile("/" + path);
          setCodeFilePath("/" + path);
          mopsaJs.setCode(content);

          const ext = path.split(".").pop() ?? "";
          const newLang = getLanguageFromFileExtension(ext);
          const state = get();
          const newMode = getActiveAnalysisMode({
            fileTree: newTree,
            activeFile: newActiveFile,
            lang: newLang,
          });
          const configUpdates = computeConfigBucketSwap(
            state,
            newMode,
            newLang,
          );

          set({
            code: content,
            lang: newLang,
            activeTab: "source",
            ...configUpdates,
          });
        }
      }
    }

    set({ fileTree: newTree, activeFile: newActiveFile });
  },

  moveNodes: (dragIds, parentId) => {
    const { fileTree, activeFile } = get();

    for (const dragId of dragIds) {
      const node = findById(fileTree, dragId);
      if (!node) continue;
      const oldPath = getNodePath(fileTree, dragId);
      if (!oldPath) continue;
      const parentPath = parentId ? getNodePath(fileTree, parentId) : null;
      const newBasePath = parentPath ? `${parentPath}/${node.name}` : node.name;

      if (node.children) {
        // Folder: move all descendant files
        for (const file of getDescendantFiles(node)) {
          const filePath = getNodePath(fileTree, file.id);
          if (!filePath) continue;
          const relative = filePath.slice(oldPath.length); // e.g. "/helper.c"
          const newFilePath = newBasePath + relative;
          if (file.id === activeFile) {
            setCodeFilePath("/" + newFilePath);
          } else {
            const content = readFile("/" + filePath);
            writeFile("/" + newFilePath, content);
            deleteFile("/" + filePath);
          }
        }
      } else {
        // File
        if (dragId === activeFile) {
          setCodeFilePath("/" + newBasePath);
        } else {
          const content = readFile("/" + oldPath);
          writeFile("/" + newBasePath, content);
          deleteFile("/" + oldPath);
        }
      }
    }

    const newTree = sortNodes(moveNodesInTree(fileTree, dragIds, parentId));
    set({ fileTree: newTree });
  },

  importFiles: (files, parentId = null) => {
    const { fileTree } = get();
    const newTree: FileTreeNode[] = JSON.parse(JSON.stringify(fileTree));

    const basePath = parentId ? (getNodePath(newTree, parentId) ?? "") : "";

    function insertIntoLevel(level: FileTreeNode[], parts: string[]): void {
      const name = parts[0];
      const isFile = parts.length === 1;
      if (isFile) {
        if (!level.find((n) => n.name === name && !n.children)) {
          level.push({ id: genId(), name });
        }
        return;
      }
      let folder = level.find(
        (n) => n.name === name && n.children !== undefined,
      ) as FileTreeNode | undefined;
      if (!folder) {
        folder = { id: genId(), name, children: [] };
        level.push(folder);
      }
      insertIntoLevel(folder.children!, parts.slice(1));
    }

    for (const { path, content } of files) {
      const fullPath = basePath ? `${basePath}/${path}` : path;
      const parts = fullPath.split("/").filter(Boolean);
      if (parts.length === 0) continue;
      writeFile("/" + fullPath, content);
      insertIntoLevel(newTree, parts);
    }

    set({ fileTree: sortNodes(newTree) });
  },

  renameNode: (id, newName) => {
    const { fileTree, activeFile } = get();
    const node = findById(fileTree, id);
    if (!node || node.name === newName) return true;

    const siblings = getSiblings(fileTree, id);
    if (siblings && siblings.some((n) => n.id !== id && n.name === newName))
      return false;

    const oldPath = getNodePath(fileTree, id);
    if (!oldPath) return true;
    const parentPath = oldPath.includes("/")
      ? oldPath.slice(0, oldPath.lastIndexOf("/"))
      : null;
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;

    if (node.children) {
      // Folder: rename all descendant file paths
      for (const file of getDescendantFiles(node)) {
        const filePath = getNodePath(fileTree, file.id);
        if (!filePath) continue;
        const relative = filePath.slice(oldPath.length);
        const newFilePath = newPath + relative;
        if (file.id === activeFile) {
          setCodeFilePath("/" + newFilePath);
        } else {
          const content = readFile("/" + filePath);
          writeFile("/" + newFilePath, content);
          deleteFile("/" + filePath);
        }
      }
    } else {
      // File
      if (id === activeFile) {
        setCodeFilePath("/" + newPath);
        const ext = newName.split(".").pop() ?? "";
        const newLang = getLanguageFromFileExtension(ext);
        const state = get();
        const newMode = getActiveAnalysisMode({
          fileTree: state.fileTree,
          activeFile: id,
          lang: newLang,
        });
        const configUpdates = computeConfigBucketSwap(state, newMode, newLang);

        set({ lang: newLang, ...configUpdates });
      } else {
        const content = readFile("/" + oldPath);
        writeFile("/" + newPath, content);
        deleteFile("/" + oldPath);
      }
    }

    const newTree = sortNodes(renameNodeById(fileTree, id, newName));
    set({ fileTree: newTree });
    return true;
  },

  toggleWorkspace: (id) => {
    const { fileTree } = get();
    set({ fileTree: toggleWorkspaceById(fileTree, id) });
  },

  createWorkspaceNode: (parentId) => {
    const { fileTree } = get();
    const id = genId();
    const siblings = getChildrenOf(fileTree, parentId);
    const name = uniqueNameInLevel(siblings, "workspace");
    const node: FileTreeNode = { id, name, children: [], isWorkspace: true };
    const newTree = sortNodes(insertNode(fileTree, parentId, node));
    set({ fileTree: newTree });
    return id;
  },
}));

// ── Persist state to localStorage (debounced) ─────────────────────────────────

let _saveTimer: ReturnType<typeof setTimeout> | null = null;

export function cancelPendingSave(): void {
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
}

useAppStore.subscribe((state) => {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    saveState({
      lang: state.lang,
      fileTree: state.fileTree,
      activeFile: state.activeFile,
      codeByLang: state.codeByLang,
      configByLang: state.configByLang,
      configXL: state.configXL,
      customConfigs: state.customConfigs,
      optionValues: state.optionValues,
      pyEntryPoint: state.pyEntryPoint,
      autoRun: state.autoRun,
      activePanel: state.activePanel,
      openCategories: state.openCategories,
    });
  }, 1000);
});
