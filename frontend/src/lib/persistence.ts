import {
  DEFAULT_CODE,
  readFile,
  setCodeFilePath,
  writeFile,
} from "./mopsa-client";
import { DEFAULT_OPTION_VALUES } from "./options-schema";
import { temporary } from "./session";
import { findFirstFile, getActiveAnalysisMode, getNodePath } from "./tree";
import type {
  ActivePanel,
  FileTreeNode,
  OpenedFolder,
  SavedConfig,
  SupportedLanguage,
} from "./types";

export const STORAGE_KEY = "mopsa-state";
const STORAGE_VERSION = 2;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PersistedState {
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
  // Legacy field kept for backward compatibility with older saved state — no
  // longer drives behaviour but persists silently to avoid migration churn.
  crossLanguage?: boolean;
  pyEntryPoint: string | null;
  autoRun: boolean;
  activePanel: ActivePanel;
  // Which options categories are expanded in the sidebar. Optional so older
  // saved state (without it) still loads — missing means "all collapsed".
  openCategories?: Record<string, boolean>;
  // The folders opened by a link (?open=), with their source.
  opened?: OpenedFolder[];
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
  pyEntryPoint: string | null;
  autoRun: boolean;
  activePanel: ActivePanel;
  openCategories: Record<string, boolean>;
  opened: OpenedFolder[];
}

export interface StateToSave {
  lang: SupportedLanguage;
  fileTree: FileTreeNode[];
  activeFile: string | null;
  codeByLang: Partial<Record<SupportedLanguage, string>>;
  configByLang: Partial<Record<SupportedLanguage, SavedConfig>>;
  configXL: SavedConfig | null;
  customConfigs: Partial<Record<string, string>>;
  optionValues: Record<string, unknown>;
  pyEntryPoint: string | null;
  autoRun: boolean;
  activePanel: ActivePanel;
  openCategories: Record<string, boolean>;
  opened: OpenedFolder[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function collectFileContents(fileTree: FileTreeNode[]): Record<string, string> {
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

/** The state as saved, its files read from the WASM filesystem. */
export function toPersisted(state: StateToSave): PersistedState {
  return {
    version: STORAGE_VERSION,
    ...state,
    fileContents: collectFileContents(state.fileTree),
  };
}

/** The visitor's saved state, null when there is none (or an older one). */
export function readPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as PersistedState;
    return saved.version === STORAGE_VERSION ? saved : null;
  } catch {
    return null;
  }
}

// A temporary session (?temp, ?embed) saves nothing.
export function saveState(state: StateToSave): void {
  if (temporary) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersisted(state)));
  } catch {
    /* localStorage might be full or disabled */
  }
}

// A temporary session starts from the defaults, not the visitor's state.
export function loadAndRestoreState(): RestoredState | null {
  if (temporary) return null;
  try {
    const saved = readPersisted();
    if (!saved) return null;

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

    // Determine config: pick configXL if the restored active file lives in a
    // workspace whose effective mode is multilanguage, otherwise the per-lang
    // config for the saved lang.
    let configText = "";
    let configPreset = "default.json";
    let configDirty = false;

    const restoredMode = getActiveAnalysisMode({
      fileTree: saved.fileTree,
      activeFile,
      lang: saved.lang,
    });
    const langConfig =
      restoredMode === "multilanguage"
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
      // "-engine" is dropped: the engine choice was removed (the batch
      // analysis always runs; the REPL lives in the results).
      optionValues: Object.fromEntries(
        Object.entries({ ...DEFAULT_OPTION_VALUES, ...saved.optionValues }).filter(
          ([flag]) => flag !== "-engine",
        ),
      ),
      pyEntryPoint: saved.pyEntryPoint,
      autoRun: saved.autoRun,
      activePanel: saved.activePanel,
      openCategories: saved.openCategories ?? {},
      opened: Array.isArray(saved.opened) ? saved.opened : [],
    };
  } catch {
    return null;
  }
}

export function clearState(): void {
  if (temporary) return;
  localStorage.removeItem(STORAGE_KEY);
}
