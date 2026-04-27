import { create } from 'zustand';
import {
  DEFAULT_CODE,
  FILE_EXTENSIONS,
  extractPreJson,
  parseConfigText,
  readFile,
  writeFile,
  deleteFile,
  setCodeFilePath,
} from './mopsa-client';
import { DEFAULT_OPTION_VALUES } from './options-schema';
import { loadAndRestoreState, saveState } from './persistence';
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
  sortNodes,
  getSiblings,
  getChildrenOf,
  uniqueNameInLevel,
} from './tree';
import type {
  ActivePanel,
  ActiveTab,
  AnalysisResult,
  CheckItem,
  FileTreeNode,
  SavedConfig,
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

  // ── Custom configs (saved per language/mode) ─────────────────────────────
  customConfigs: Partial<Record<string, string>>;

  // ── Auto-run ─────────────────────────────────────────────────────────────
  autoRun: boolean;

  // ── Actions ──────────────────────────────────────────────────────────────
  setPresets: (presets: shareData) => void;
  toggleAutoRun: () => void;
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
  toggleCrossLanguage: () => void;
  setPyEntryPoint: (path: string | null) => void;

  // ── File tree actions ────────────────────────────────────────────────────
  selectFile: (id: string) => void;
  createFileNode: (parentId: string | null) => string;
  createFolderNode: (parentId: string | null) => string;
  deleteNodes: (ids: string[]) => void;
  moveNodes: (dragIds: string[], parentId: string | null) => void;
  renameNode: (id: string, newName: string) => boolean;
  importFiles: (files: { path: string; content: string }[], parentId?: string | null) => void;
}

// ── Sync initial code ─────────────────────────────────────────────────────────

mopsaJs.setCode(DEFAULT_CODE.c);
mopsaJs.writeFile('/example.py', DEFAULT_CODE.python);
mopsaJs.writeFile('/example.u', DEFAULT_CODE.universal);

// ── Restore from localStorage (overwrites WASM defaults if saved state exists) ─

const _restored = loadAndRestoreState();

// ── Initial tree ──────────────────────────────────────────────────────────────

const _initialTree = _restored?.fileTree ?? buildInitialTree();
const _initialActiveFile = _restored?.activeFile ?? findFirstFile(_initialTree);

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppStore>((set, get) => ({
  lang: _restored?.lang ?? 'c',
  code: _restored?.code ?? DEFAULT_CODE.c,
  configText: _restored?.configText ?? '',
  configPreset: _restored?.configPreset ?? 'default.json',
  configDirty: _restored?.configDirty ?? false,
  codeByLang: _restored?.codeByLang ?? {},
  configByLang: _restored?.configByLang ?? {},
  configXL: _restored?.configXL ?? null,
  customConfigs: _restored?.customConfigs ?? {},
  presets: null,
  checks: [],
  warnings: '',
  rawOutput: '',
  selectivity: null,
  analysisTime: null,
  analysisSuccess: null,
  analysisError: null,
  activePanel: _restored?.activePanel ?? 'files',
  activeTab: 'source',
  optionValues: _restored?.optionValues ?? { ...DEFAULT_OPTION_VALUES },
  crossLanguage: _restored?.crossLanguage ?? false,
  pyEntryPoint: _restored?.pyEntryPoint ?? null,
  fileTree: _initialTree,
  activeFile: _initialActiveFile,
  autoRun: _restored?.autoRun ?? true,

  // ── Presets ────────────────────────────────────────────────────────────
  setPresets: (presets) => set({ presets }),
  toggleAutoRun: () => set((s) => ({ autoRun: !s.autoRun })),

  // ── Code / config ──────────────────────────────────────────────────────
  setCode: (code) => {
    mopsaJs.setCode(code.endsWith('\n') ? code : code + '\n');
    set({ code });
  },

  setConfigText: (text, dirty = true) => {
    const { crossLanguage, lang, configPreset, configByLang, configXL, customConfigs, configText: currentText } = get();
    // If the content hasn't meaningfully changed, ignore (handles Monaco's programmatic echo).
    if (dirty && text.trim() === currentText.trim()) return;
    const key = crossLanguage ? 'multilanguage' : lang;
    let customUpdate: Partial<AppStore> = {};
    if (!dirty) {
      mopsaJs.setConfig(text);
    } else if (parseConfigText(text) !== null) {
      mopsaJs.setConfig(text);
      customUpdate = { customConfigs: { ...customConfigs, [key]: text } };
    }
    const saved: SavedConfig = { preset: configPreset, text, dirty };
    if (crossLanguage) {
      set({ configText: text, configDirty: dirty, configXL: { ...configXL, ...saved }, ...customUpdate });
    } else {
      set({
        configText: text,
        configDirty: dirty,
        configByLang: { ...configByLang, [lang]: saved },
        ...customUpdate,
      });
    }
  },

  applyCustom: (key) => {
    const { customConfigs, crossLanguage, lang, configByLang } = get();
    const text = customConfigs[key];
    if (!text) return;
    mopsaJs.setConfig(text);
    const saved: SavedConfig = { preset: 'custom', text, dirty: true };
    if (crossLanguage) {
      set({ configText: text, configPreset: 'custom', configDirty: true, configXL: saved });
    } else {
      set({
        configText: text,
        configPreset: 'custom',
        configDirty: true,
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
          ? (Object.keys(pythonConfigs).find((k) => k === 'multilanguage.json')
            ?? Object.keys(pythonConfigs).find((k) => k.toLowerCase().includes('multilanguage'))
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
    if (wPath === currentPath) { set({ activeFile: id, activeTab: 'source' }); return; }

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

    set({ activeFile: id, activeTab: 'source', code: newContent, lang: newLang, ...configUpdates });
  },

  createFileNode: (parentId) => {
    const { fileTree } = get();
    const id = genId();
    const siblings = getChildrenOf(fileTree, parentId);
    const name = uniqueNameInLevel(siblings, 'new_file');
    const node: FileTreeNode = { id, name };
    const parentPath = parentId ? getNodePath(fileTree, parentId) : null;
    const filePath = parentPath ? `${parentPath}/${name}` : name;
    writeFile('/' + filePath, '');
    const newTree = sortNodes(insertNode(fileTree, parentId, node));
    set({ fileTree: newTree });
    return id;
  },

  createFolderNode: (parentId) => {
    const { fileTree } = get();
    const id = genId();
    const siblings = getChildrenOf(fileTree, parentId);
    const name = uniqueNameInLevel(siblings, 'new_folder');
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
          const content = readFile('/' + path);
          setCodeFilePath('/' + path);
          mopsaJs.setCode(content);

          const ext = path.split('.').pop() ?? '';
          const newLang = getLanguageFromFileExtension(ext);
          const { lang: currentLang, crossLanguage, configByLang, configText, configPreset, configDirty, presets } = get();

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

          set({ code: content, lang: newLang, activeTab: 'source', ...configUpdates });
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

    const newTree = sortNodes(moveNodesInTree(fileTree, dragIds, parentId));
    set({ fileTree: newTree });
  },

  importFiles: (files, parentId = null) => {
    const { fileTree } = get();
    const newTree: FileTreeNode[] = JSON.parse(JSON.stringify(fileTree));

    const basePath = parentId ? (getNodePath(newTree, parentId) ?? '') : '';

    function insertIntoLevel(level: FileTreeNode[], parts: string[]): void {
      const name = parts[0];
      const isFile = parts.length === 1;
      if (isFile) {
        if (!level.find((n) => n.name === name && !n.children)) {
          level.push({ id: genId(), name });
        }
        return;
      }
      let folder = level.find((n) => n.name === name && n.children !== undefined) as FileTreeNode | undefined;
      if (!folder) {
        folder = { id: genId(), name, children: [] };
        level.push(folder);
      }
      insertIntoLevel(folder.children!, parts.slice(1));
    }

    for (const { path, content } of files) {
      const fullPath = basePath ? `${basePath}/${path}` : path;
      const parts = fullPath.split('/').filter(Boolean);
      if (parts.length === 0) continue;
      writeFile('/' + fullPath, content);
      insertIntoLevel(newTree, parts);
    }

    set({ fileTree: sortNodes(newTree) });
  },

  renameNode: (id, newName) => {
    const { fileTree, activeFile } = get();
    const node = findById(fileTree, id);
    if (!node || node.name === newName) return true;

    const siblings = getSiblings(fileTree, id);
    if (siblings && siblings.some((n) => n.id !== id && n.name === newName)) return false;

    const oldPath = getNodePath(fileTree, id);
    if (!oldPath) return true;
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
        const newLang = getLanguageFromFileExtension(ext);
        const { lang: currentLang, crossLanguage, configByLang, configText, configPreset, configDirty, presets } = get();

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

        set({ lang: newLang, ...configUpdates });
      } else {
        const content = readFile('/' + oldPath);
        writeFile('/' + newPath, content);
        deleteFile('/' + oldPath);
      }
    }

    const newTree = sortNodes(renameNodeById(fileTree, id, newName));
    set({ fileTree: newTree });
    return true;
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
      crossLanguage: state.crossLanguage,
      pyEntryPoint: state.pyEntryPoint,
      autoRun: state.autoRun,
      activePanel: state.activePanel,
    });
  }, 1000);
});
