export type SupportedLanguage = "c" | "python" | "universal";
export type WorkspaceMode =
  | "c"
  | "python"
  | "universal"
  | "multilanguage"
  | "unknown";
export type ActivePanel = "files" | "domains" | "options" | "about" | null;
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

/** A soundness assumption Mopsa made; global when it has no range. */
export interface Assumption {
  message: string;
  range?: { start?: CheckRange; end?: CheckRange };
}

/** Frame of a panic's control context: a call or a loop iteration. */
export interface PanicFrame {
  function?: string;
  loop_info?: string;
  range: { start?: CheckRange; end?: CheckRange };
}

/** Where a failed analysis stopped. */
export interface PanicInfo {
  range: { start?: CheckRange; end?: CheckRange } | null;
  callstack: PanicFrame[];
  backtrace: string | null;
}

export interface ParsedOutput {
  success: boolean;
  time: number;
  mopsa_version: string;
  files: string[];
  selectivity: string;
  checks: CheckItem[];
  assumptions?: Assumption[];
  exception?: string;
  backtrace?: string;
  range?: { start?: CheckRange; end?: CheckRange };
  callstack?: PanicFrame[];
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
