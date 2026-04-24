export type SupportedLanguage = 'c' | 'python' | 'universal';
export type ActivePanel = 'files' | 'domains' | 'options' | null;
export type ActiveTab = 'source' | 'config';

export interface CheckRange {
  file: string;
  line: number;
  column: number;
}

export interface CheckItem {
  kind: 'safe' | 'warning' | 'error' | 'info';
  title: string;
  messages: string;
  range: { start: CheckRange; end: CheckRange };
  callstack: { function: string; range: { start: CheckRange; end: CheckRange } }[];
}

export interface ParsedOutput {
  success: boolean;
  time: number;
  mopsa_version: string;
  files: string[];
  selectivity: string;
  checks: CheckItem[];
  assumptions: unknown[];
  exception?: string;
  backtrace?: string;
}

export interface AnalysisResult {
  raw: string;
  parsed: ParsedOutput | null;
  durationMs: number;
}
