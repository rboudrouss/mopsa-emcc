export type SupportedLanguage = "c" | "python" | "universal";
export type WorkspaceMode =
  | "c"
  | "python"
  | "universal"
  | "multilanguage"
  | "unknown";
export type ActivePanel = "files" | "domains" | "options" | null;
export type ActiveTab = "source" | "config";
export type SavedConfig = { preset: string; text: string; dirty: boolean };

interface CheckRange {
  file: string;
  line: number;
  column: number;
}

export interface CheckItem {
  kind: "safe" | "warning" | "error" | "info";
  title: string;
  messages: string;
  range: { start: CheckRange | null; end: CheckRange | null };
  callstack: {
    function: string;
    range: { start: CheckRange | null; end: CheckRange | null };
  }[];
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

export interface FileTreeNode {
  id: string;
  name: string;
  children?: FileTreeNode[];
  isWorkspace?: boolean;
  // Manual override of the auto-detected workspace mode.
  // Only meaningful when isWorkspace is true; undefined = auto-detect.
  mode?: WorkspaceMode;
}
