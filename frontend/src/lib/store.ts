import { create } from 'zustand';
import {
  DEFAULT_CODE,
  FILE_EXTENSIONS,
  extractPreJson,
  readFile,
  writeFile,
  deleteFile,
  setCodeFilePath,
} from './mopsa-client';
import { DEFAULT_OPTION_VALUES } from './options-schema';
import { getLanguageFromFileExtension } from './index';
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
} from './tree';
import type {
  ActivePanel,
  ActiveTab,
  AnalysisResult,
  CheckItem,
  FileTreeNode,
  SupportedLanguage,
} from './types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFileNode(name: string): FileTreeNode {
  return { id: genId(), name };
}

function buildInitialTree(): FileTreeNode[] {
  // listDir is already called by mopsaJs
  const result = mopsaJs.listDir('/');
  const [, ...names] = result;
  return names
    .filter((n) => n !== 'dev' && n !== 'config.json')
    .map((name) => makeFileNode(name));
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

  // ── Actions ──────────────────────────────────────────────────────────────
  setCode: (code: string) => void;
  setConfigText: (text: string, dirty?: boolean) => void;
  applyPreset: (name: string, text: string) => void;
  setAnalysisResult: (r: AnalysisResult) => void;
  setLang: (lang: SupportedLanguage, defaultConfig: string) => void;
  togglePanel: (panel: Exclude<ActivePanel, null>) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setOptionValue: (flag: string, value: unknown) => void;
  resetOption: (flag: string) => void;

  // ── File tree actions ────────────────────────────────────────────────────
  selectFile: (id: string) => void;
  createFileNode: (parentId: string | null) => string;
  createFolderNode: (parentId: string | null) => string;
  deleteNodes: (ids: string[]) => void;
  moveNodes: (dragIds: string[], parentId: string | null) => void;
  renameNode: (id: string, newName: string) => void;
}

// ── Sync initial code ─────────────────────────────────────────────────────────

mopsaJs.setCode(DEFAULT_CODE.c);

// ── Initial tree ──────────────────────────────────────────────────────────────

const _initialTree = buildInitialTree();
const _initialActiveFile = findFirstFile(_initialTree);

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppStore>((set, get) => ({
  lang: 'c',
  code: DEFAULT_CODE.c,
  configText: '',
  configPreset: 'default.json',
  configDirty: false,
  codeByLang: {},
  checks: [],
  warnings: '',
  rawOutput: '',
  selectivity: null,
  analysisTime: null,
  analysisSuccess: null,
  analysisError: null,
  activePanel: null,
  activeTab: 'source',
  optionValues: { ...DEFAULT_OPTION_VALUES },
  fileTree: _initialTree,
  activeFile: _initialActiveFile,

  // ── Code / config ──────────────────────────────────────────────────────
  setCode: (code) => {
    mopsaJs.setCode(code);
    set({ code });
  },

  setConfigText: (text, dirty = true) => {
    if (!dirty) mopsaJs.setConfig(text);
    set({ configText: text, configDirty: dirty });
  },

  applyPreset: (name, text) => {
    mopsaJs.setConfig(text);
    set({ configText: text, configPreset: name, configDirty: false });
  },

  setAnalysisResult: (r) => {
    const p = r.parsed;
    let error: string | null = null;
    if (!p) {
      error = r.raw ? 'Could not parse analysis output' : null;
    } else if (!p.success) {
      error = p.exception ?? 'Analysis failed';
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
    const savedCode: Partial<Record<SupportedLanguage, string>> = {
      ...current.codeByLang,
      [current.lang]: current.code,
    };
    const newCode = savedCode[lang] ?? DEFAULT_CODE[lang];
    const ext = FILE_EXTENSIONS[lang];
    const newPath = `/code.${ext}`;
    setCodeFilePath(newPath);
    mopsaJs.setCode(newCode);
    mopsaJs.setConfig(defaultConfig);

    // Keep tree in sync: update the name of the active file node
    const { fileTree, activeFile } = current;
    let newTree = fileTree;
    const newFileName = `code.${ext}`;
    if (activeFile) {
      newTree = renameNodeById(fileTree, activeFile, newFileName);
    }

    set({
      lang,
      code: newCode,
      codeByLang: savedCode,
      configText: defaultConfig,
      configPreset: 'default.json',
      configDirty: false,
      checks: [],
      warnings: '',
      rawOutput: '',
      selectivity: null,
      analysisTime: null,
      analysisSuccess: null,
      analysisError: null,
      fileTree: newTree,
    });
  },

  togglePanel: (panel) => {
    set((s) => ({ activePanel: s.activePanel === panel ? null : panel }));
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setOptionValue: (flag, value) => {
    set((s) => ({ optionValues: { ...s.optionValues, [flag]: value } }));
  },

  resetOption: (flag) => {
    set((s) => ({
      optionValues: { ...s.optionValues, [flag]: DEFAULT_OPTION_VALUES[flag] },
    }));
  },

  // ── File tree actions ──────────────────────────────────────────────────

  selectFile: (id) => {
    const { fileTree } = get();
    const path = getNodePath(fileTree, id);
    if (!path) return;
    const wPath = '/' + path;

    const currentPath = mopsaJs.getCodeFilePath()[1];
    if (wPath === currentPath) { set({ activeFile: id }); return; }

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

    const ext = path.split('.').pop() ?? '';
    const lang = getLanguageFromFileExtension(ext);
    set({ activeFile: id, code: newContent, lang });
  },

  createFileNode: (parentId) => {
    const { fileTree } = get();
    const id = genId();
    const node: FileTreeNode = { id, name: 'new_file' };
    // Compute the path and write an empty file to mopsaJs
    const parentPath = parentId ? getNodePath(fileTree, parentId) : null;
    const filePath = parentPath ? `${parentPath}/new_file` : 'new_file';
    writeFile('/' + filePath, '');
    const newTree = insertNode(fileTree, parentId, node);
    set({ fileTree: newTree });
    return id;
  },

  createFolderNode: (parentId) => {
    const id = genId();
    const node: FileTreeNode = { id, name: 'new_folder', children: [] };
    const newTree = insertNode(get().fileTree, parentId, node);
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
            deleteFile('/' + path);
          } catch { /* ignore */ }
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
          setCodeFilePath('/' + path);
          const content = readFile('/' + path);
          mopsaJs.setCode(content);
          set({ code: content });
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
            setCodeFilePath('/' + newFilePath);
          } else {
            const content = readFile('/' + filePath);
            writeFile('/' + newFilePath, content);
            deleteFile('/' + filePath);
          }
        }
      } else {
        // File
        if (dragId === activeFile) {
          setCodeFilePath('/' + newBasePath);
        } else {
          const content = readFile('/' + oldPath);
          writeFile('/' + newBasePath, content);
          deleteFile('/' + oldPath);
        }
      }
    }

    const newTree = moveNodesInTree(fileTree, dragIds, parentId);
    set({ fileTree: newTree });
  },

  renameNode: (id, newName) => {
    const { fileTree, activeFile } = get();
    const node = findById(fileTree, id);
    if (!node || node.name === newName) return;

    const oldPath = getNodePath(fileTree, id);
    if (!oldPath) return;
    const parentPath = oldPath.includes('/')
      ? oldPath.slice(0, oldPath.lastIndexOf('/'))
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
          setCodeFilePath('/' + newFilePath);
        } else {
          const content = readFile('/' + filePath);
          writeFile('/' + newFilePath, content);
          deleteFile('/' + filePath);
        }
      }
    } else {
      // File
      if (id === activeFile) {
        setCodeFilePath('/' + newPath);
        const ext = newName.split('.').pop() ?? '';
        set({ lang: getLanguageFromFileExtension(ext) });
      } else {
        const content = readFile('/' + oldPath);
        writeFile('/' + newPath, content);
        deleteFile('/' + oldPath);
      }
    }

    const newTree = renameNodeById(fileTree, id, newName);
    set({ fileTree: newTree });
  },
}));
