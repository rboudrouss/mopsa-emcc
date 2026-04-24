import { create } from 'zustand';
import { DEFAULT_CODE, FILE_EXTENSIONS, setCodeFilePath } from './mopsa-client';
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
  assumptions: unknown[];
  rawOutput: string;
  selectivity: string | null;
  analysisTime: number | null;
  analysisSuccess: boolean | null;

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

export const useAppStore = create<AppStore>((set, get) => ({
  lang: 'c',
  code: DEFAULT_CODE.c,
  configText: '',
  configPreset: 'default.json',
  configDirty: false,
  codeByLang: {},
  checks: [],
  assumptions: [],
  rawOutput: '',
  selectivity: null,
  analysisTime: null,
  analysisSuccess: null,
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
    set({
      rawOutput: r.raw,
      checks: r.parsed?.checks ?? [],
      assumptions: r.parsed?.assumptions ?? [],
      selectivity: r.parsed?.selectivity ?? null,
      analysisTime: r.parsed?.time ?? null,
      analysisSuccess: r.parsed?.success ?? null,
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
      assumptions: [],
      rawOutput: '',
      selectivity: null,
      analysisTime: null,
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
