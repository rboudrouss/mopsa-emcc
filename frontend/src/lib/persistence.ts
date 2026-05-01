import {
  DEFAULT_CODE,
  readFile,
  setCodeFilePath,
  writeFile,
} from "./mopsa-client";
import { DEFAULT_OPTION_VALUES } from "./options-schema";
import { findFirstFile, getNodePath } from "./tree";
import type {
  ActivePanel,
  FileTreeNode,
  SavedConfig,
  SupportedLanguage,
} from "./types";

const STORAGE_KEY = "mopsa-state";
const STORAGE_VERSION = 2;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PersistedState {
  version: number;
  lang: SupportedLanguage;
  fileTree: FileTreeNode[];
  activeFile: string | null;
  fileContents: Record<string, string>;
  codeByLang: Partial<Record<SupportedLanguage, string>>;
  configByLang: Partial<Record<SupportedLanguage, SavedConfig>>;
  configXL: SavedConfig | null;
  customConfigs: Partial<Record<string, string>>;
  optionValues: Record<string, unknown>;
  crossLanguage: boolean;
  pyEntryPoint: string | null;
  autoRun: boolean;
  activePanel: ActivePanel;
}

interface RestoredState {
  lang: SupportedLanguage;
  code: string;
  configText: string;
  configPreset: string;
  configDirty: boolean;
  fileTree: FileTreeNode[];
  activeFile: string | null;
  codeByLang: Partial<Record<SupportedLanguage, string>>;
  configByLang: Partial<Record<SupportedLanguage, SavedConfig>>;
  configXL: SavedConfig | null;
  customConfigs: Partial<Record<string, string>>;
  optionValues: Record<string, unknown>;
  crossLanguage: boolean;
  pyEntryPoint: string | null;
  autoRun: boolean;
  activePanel: ActivePanel;
}

interface StateToSave {
  lang: SupportedLanguage;
  fileTree: FileTreeNode[];
  activeFile: string | null;
  codeByLang: Partial<Record<SupportedLanguage, string>>;
  configByLang: Partial<Record<SupportedLanguage, SavedConfig>>;
  configXL: SavedConfig | null;
  customConfigs: Partial<Record<string, string>>;
  optionValues: Record<string, unknown>;
  crossLanguage: boolean;
  pyEntryPoint: string | null;
  autoRun: boolean;
  activePanel: ActivePanel;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function collectFileContents(fileTree: FileTreeNode[]): Record<string, string> {
  const result: Record<string, string> = {};
  function walk(nodes: FileTreeNode[], prefix: string) {
    for (const node of nodes) {
      const path = prefix ? `${prefix}/${node.name}` : node.name;
      if (node.children !== undefined) {
        walk(node.children, path);
      } else {
        try {
          result[path] = readFile("/" + path);
        } catch {
          /* ignore unreadable files */
        }
      }
    }
  }
  walk(fileTree, "");
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function saveState(state: StateToSave): void {
  try {
    const fileContents = collectFileContents(state.fileTree);
    const persisted: PersistedState = {
      version: STORAGE_VERSION,
      ...state,
      fileContents,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    /* localStorage might be full or disabled */
  }
}

export function loadAndRestoreState(): RestoredState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as PersistedState;
    if (saved.version !== STORAGE_VERSION) return null;

    // Determine active file and code
    let code = DEFAULT_CODE[saved.lang] ?? "";
    let activeFile = saved.activeFile;

    const resolveFile = (id: string | null) => {
      if (!id) return null;
      const path = getNodePath(saved.fileTree, id);
      if (!path || saved.fileContents[path] === undefined) return null;
      return { id, path, content: saved.fileContents[path] };
    };

    const resolved =
      resolveFile(activeFile) ?? resolveFile(findFirstFile(saved.fileTree));
    if (resolved) {
      activeFile = resolved.id;
      code = resolved.content;
      // Set the active file path BEFORE writing file contents so that
      // non-active files land in _extraFiles (not overwrite _code).
      setCodeFilePath("/" + resolved.path);
    }

    // Restore all files into the WASM filesystem
    for (const [path, content] of Object.entries(saved.fileContents)) {
      writeFile("/" + path, content);
    }

    if (resolved) {
      mopsaJs.setCode(code);
    }

    // Determine config
    let configText = "";
    let configPreset = "default.json";
    let configDirty = false;

    const langConfig = saved.crossLanguage
      ? saved.configXL
      : saved.configByLang[saved.lang];
    if (langConfig) {
      ({
        text: configText,
        preset: configPreset,
        dirty: configDirty,
      } = langConfig);
      if (configText) mopsaJs.setConfig(configText);
    }

    return {
      lang: saved.lang,
      code,
      configText,
      configPreset,
      configDirty,
      fileTree: saved.fileTree,
      activeFile,
      codeByLang: saved.codeByLang,
      configByLang: saved.configByLang,
      configXL: saved.configXL,
      customConfigs: saved.customConfigs,
      // Merge with current defaults so new options added after save still appear
      optionValues: { ...DEFAULT_OPTION_VALUES, ...saved.optionValues },
      crossLanguage: saved.crossLanguage,
      pyEntryPoint: saved.pyEntryPoint,
      autoRun: saved.autoRun,
      activePanel: saved.activePanel,
    };
  } catch {
    return null;
  }
}

export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY);
}
