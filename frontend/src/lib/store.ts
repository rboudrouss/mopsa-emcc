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

type SavedConfig = { preset: string; text: string; dirty: boolean };

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
  crossLanguage: boolean;
  pyEntryPoint: string | null; // null = auto (active file)

  // ── Actions ──────────────────────────────────────────────────────────────
  setPresets: (presets: shareData) => void;
  setCode: (code: string) => void;
  setConfigText: (text: string, dirty?: boolean) => void;
  applyPreset: (name: string, text: string) => void;
  setAnalysisResult: (r: AnalysisResult) => void;
  setLang: (lang: SupportedLanguage, defaultConfig: string) => void;
  togglePanel: (panel: Exclude<ActivePanel, null>) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setOptionValue: (flag: string, value: unknown) => void;
  resetOption: (flag: string) => void;
  toggleCrossLanguage: () => void;
  setPyEntryPoint: (path: string | null) => void;

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
mopsaJs.writeFile('/example.py', DEFAULT_CODE.python);
mopsaJs.writeFile('/example.u', DEFAULT_CODE.universal);

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
  configByLang: {},
  configXL: null,
  presets: null,
  checks: [],
  warnings: '',
  rawOutput: '',
  selectivity: null,
  analysisTime: null,
  analysisSuccess: null,
  analysisError: null,
  activePanel: 'files',
  activeTab: 'source',
  optionValues: { ...DEFAULT_OPTION_VALUES },
  crossLanguage: false,
  pyEntryPoint: null,
  fileTree: _initialTree,
  activeFile: _initialActiveFile,

  // ── Presets ────────────────────────────────────────────────────────────
  setPresets: (presets) => set({ presets }),

  // ── Code / config ──────────────────────────────────────────────────────
  setCode: (code) => {
    mopsaJs.setCode(code);
    set({ code });
  },

  setConfigText: (text, dirty = true) => {
    const { crossLanguage, lang, configPreset, configByLang, configXL } = get();
    if (!dirty) mopsaJs.setConfig(text);
    const saved: SavedConfig = { preset: configPreset, text, dirty };
    if (crossLanguage) {
      set({ configText: text, configDirty: dirty, configXL: { ...configXL, ...saved } });
    } else {
      set({
        configText: text,
        configDirty: dirty,
        configByLang: { ...configByLang, [lang]: saved },
      });
    }
  },

  applyPreset: (name, text) => {
    const { crossLanguage, lang, configByLang } = get();
    mopsaJs.setConfig(text);
    const saved: SavedConfig = { preset: name, text, dirty: false };
    if (crossLanguage) {
      set({ configText: text, configPreset: name, configDirty: false, configXL: saved });
    } else {
      set({
        configText: text,
        configPreset: name,
        configDirty: false,
        configByLang: { ...configByLang, [lang]: saved },
      });
    }
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

    // Save current lang config and restore saved config for new lang
    const newConfigByLang: Partial<Record<SupportedLanguage, SavedConfig>> = {
      ...current.configByLang,
      [current.lang]: { preset: current.configPreset, text: current.configText, dirty: current.configDirty },
    };
    const savedLangConfig = !current.crossLanguage ? current.configByLang[lang] : undefined;
    const newText = savedLangConfig?.text ?? defaultConfig;
    const newPreset = savedLangConfig?.preset ?? 'default.json';
    const newDirty = savedLangConfig?.dirty ?? false;
    mopsaJs.setConfig(newText);

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
      configText: newText,
      configPreset: newPreset,
      configDirty: newDirty,
      configByLang: newConfigByLang,
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

  setPyEntryPoint: (path) => set({ pyEntryPoint: path }),

  toggleCrossLanguage: () => {
    const { crossLanguage, lang, configText, configPreset, configDirty, configByLang, configXL, presets } = get();
    const currentSaved: SavedConfig = { preset: configPreset, text: configText, dirty: configDirty };

    if (!crossLanguage) {
      // Switching TO cross-language: save current per-lang config, load XL config
      const newConfigByLang = { ...configByLang, [lang]: currentSaved };

      let newConfig: SavedConfig;
      if (configXL) {
        newConfig = configXL;
      } else {
        // Default: first multilanguage config from python section
        const pythonConfigs = presets?.configs.python;
        const xlKey = pythonConfigs
          ? (Object.keys(pythonConfigs).find((k) => k.toLowerCase().includes('multilanguage'))
            ?? Object.keys(pythonConfigs)[0])
          : undefined;
        const xlText = xlKey && pythonConfigs ? (pythonConfigs[xlKey] ?? configText) : configText;
        newConfig = { preset: xlKey ?? 'default.json', text: xlText, dirty: false };
      }

      mopsaJs.setConfig(newConfig.text);
      set({
        crossLanguage: true,
        configByLang: newConfigByLang,
        configText: newConfig.text,
        configPreset: newConfig.preset,
        configDirty: newConfig.dirty,
      });
    } else {
      // Switching FROM cross-language: save XL config, restore per-lang config
      const newConfigXL = currentSaved;
      const savedLangConfig = configByLang[lang];

      let newText: string, newPreset: string, newDirty: boolean;
      if (savedLangConfig) {
        ({ text: newText, preset: newPreset, dirty: newDirty } = savedLangConfig);
      } else {
        const langConfigs = presets?.configs[lang as 'c' | 'python' | 'universal' | 'cfg'];
        const defaultText = langConfigs?.['default.json'] ?? configText;
        newText = defaultText;
        newPreset = 'default.json';
        newDirty = false;
      }

      mopsaJs.setConfig(newText);
      set({
        crossLanguage: false,
        configXL: newConfigXL,
        configText: newText,
        configPreset: newPreset,
        configDirty: newDirty,
      });
    }
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
    const newLang = getLanguageFromFileExtension(ext);
    const { lang: currentLang, crossLanguage, configByLang, configText, configPreset, configDirty, presets } = get();

    // When crossLanguage is OFF and the language changed, restore config for new lang
    let configUpdates: Partial<AppStore> = {};
    if (!crossLanguage && newLang !== currentLang) {
      const newConfigByLang = {
        ...configByLang,
        [currentLang]: { preset: configPreset, text: configText, dirty: configDirty },
      };
      const savedLangConfig = configByLang[newLang];
      if (savedLangConfig) {
        mopsaJs.setConfig(savedLangConfig.text);
        configUpdates = {
          configText: savedLangConfig.text,
          configPreset: savedLangConfig.preset,
          configDirty: savedLangConfig.dirty,
          configByLang: newConfigByLang,
        };
      } else {
        const langConfigs = presets?.configs[newLang as 'c' | 'python' | 'universal' | 'cfg'];
        const defaultText = langConfigs?.['default.json'];
        if (defaultText) {
          mopsaJs.setConfig(defaultText);
          configUpdates = {
            configText: defaultText,
            configPreset: 'default.json',
            configDirty: false,
            configByLang: newConfigByLang,
          };
        }
      }
    }

    set({ activeFile: id, code: newContent, lang: newLang, ...configUpdates });
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
