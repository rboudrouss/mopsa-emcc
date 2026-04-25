import { create } from 'zustand';
import { DEFAULT_CODE, FILE_EXTENSIONS, extractPreJson, setCodeFilePath } from './mopsa-client';
import { DEFAULT_OPTION_VALUES } from './options-schema';
import type { ActivePanel, ActiveTab, AnalysisResult, CheckItem, SupportedLanguage } from './types';

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
}

// Sync the initial code into mopsaJs so the very first analysis
// matches what the editor displays (mopsa_api.js starts with a different default).
mopsaJs.setCode(DEFAULT_CODE.c);

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
    // Save current code before switching
    const savedCode: Partial<Record<SupportedLanguage, string>> = {
      ...current.codeByLang,
      [current.lang]: current.code,
    };
    const newCode = savedCode[lang] ?? DEFAULT_CODE[lang];
    const ext = FILE_EXTENSIONS[lang];
    setCodeFilePath(`/code.${ext}`);
    mopsaJs.setCode(newCode);
    mopsaJs.setConfig(defaultConfig);
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
}));
