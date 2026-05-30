import { create } from "zustand";
import type { DapScope, DapStackFrame, DapVariable } from "./dap/types";
import type { CheckItem } from "./types";

export type DebugStatus =
  | "idle"
  | "initializing"
  | "running"
  | "stopped"
  | "terminated"
  | "error";

export interface StopLocation {
  path: string;
  line: number;
}

interface DebugState {
  status: DebugStatus;
  stoppedReason?: string;
  errorMessage?: string;
  callStack: DapStackFrame[];
  currentFrameId: number | null;
  stopLocation: StopLocation | null;
  scopes: DapScope[];
  variables: Record<number, DapVariable[]>; // variablesReference → children
  consoleLines: string[];
  alarms: CheckItem[]; // alarms reported via DAP `output` events
  breakpoints: Record<string, number[]>; // FS path → 1-based lines

  setStatus: (s: DebugStatus, reason?: string) => void;
  setError: (msg: string) => void;
  setStopped: (
    frames: DapStackFrame[],
    location: StopLocation | null,
    reason?: string,
  ) => void;
  setCurrentFrame: (id: number | null) => void;
  setScopes: (scopes: DapScope[]) => void;
  setVariables: (vref: number, vars: DapVariable[]) => void;
  appendConsole: (line: string) => void;
  clearConsole: () => void;
  addAlarms: (items: CheckItem[]) => void;
  toggleBreakpoint: (path: string, line: number) => void;
  resetDebug: () => void;
}

export const useDebugStore = create<DebugState>((set) => ({
  status: "idle",
  callStack: [],
  currentFrameId: null,
  stopLocation: null,
  scopes: [],
  variables: {},
  consoleLines: [],
  alarms: [],
  breakpoints: {},

  setStatus: (status, reason) =>
    set({ status, ...(reason !== undefined ? { stoppedReason: reason } : {}) }),

  setError: (errorMessage) => set({ status: "error", errorMessage }),

  setStopped: (callStack, stopLocation, reason) =>
    set({
      status: "stopped",
      stoppedReason: reason,
      callStack,
      stopLocation,
      currentFrameId: callStack.length > 0 ? callStack[0].id : null,
      scopes: [],
      variables: {},
    }),

  setCurrentFrame: (currentFrameId) => set({ currentFrameId }),
  setScopes: (scopes) => set({ scopes, variables: {} }),
  setVariables: (vref, vars) =>
    set((s) => ({ variables: { ...s.variables, [vref]: vars } })),

  appendConsole: (line) => set((s) => ({ consoleLines: [...s.consoleLines, line] })),
  clearConsole: () => set({ consoleLines: [] }),
  addAlarms: (items) => set((s) => ({ alarms: [...s.alarms, ...items] })),

  toggleBreakpoint: (path, line) =>
    set((s) => {
      const cur = s.breakpoints[path] ?? [];
      const next = cur.includes(line)
        ? cur.filter((l) => l !== line)
        : [...cur, line].sort((a, b) => a - b);
      return { breakpoints: { ...s.breakpoints, [path]: next } };
    }),

  resetDebug: () =>
    set({
      status: "idle",
      stoppedReason: undefined,
      errorMessage: undefined,
      callStack: [],
      currentFrameId: null,
      stopLocation: null,
      scopes: [],
      variables: {},
      consoleLines: [],
      alarms: [],
      // breakpoints are intentionally preserved across runs
    }),
}));
