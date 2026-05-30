// DAP wire + domain types, matching what Mopsa's dap.ml produces.
// (analyzer/framework/engines/interactive/dap.ml)

export interface DapSource {
  name?: string;
  path?: string;
  sourceReference?: number;
}

export interface DapStackFrame {
  id: number;
  name: string;
  line: number;
  column: number;
  source?: DapSource;
}

export interface DapScope {
  name: string;
  variablesReference: number;
  expensive?: boolean;
}

export interface DapVariable {
  name: string;
  value: string;
  variablesReference: number;
}

export interface DapBreakpoint {
  verified: boolean;
  line?: number;
}

// Event bodies we care about.
export interface StoppedBody {
  reason: string;
  threadId?: number;
}

export interface OutputBody {
  category?: string;
  output?: string | null;
  data?: unknown;
}

// Raw protocol envelope.
export interface DapMessage {
  seq: number;
  type: "request" | "response" | "event";
  // response
  request_seq?: number;
  success?: boolean;
  command?: string;
  body?: unknown;
  // event
  event?: string;
}
