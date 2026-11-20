import { create } from "zustand";

/**
 * Live progress of the running batch analysis, from Mopsa's `progress` hook
 * (-progress-json): the call stack being analyzed, outermost first, with the
 * line reached and the share of statements done in each function.
 */
interface ProgressState {
  entries: MopsaProgressEntry[];
  startedAt: number | null;
  start: () => void;
  update: (entries: MopsaProgressEntry[]) => void;
}

export const useProgress = create<ProgressState>((set) => ({
  entries: [],
  startedAt: null,
  start: () => set({ entries: [], startedAt: performance.now() }),
  update: (entries) => set({ entries }),
}));

/** Flags turning on the JSON progress lines (WASM backend only: the jsoo
 *  worker doesn't stream its output). */
export const PROGRESS_FLAGS = ["-hook", "progress", "-progress-json"];

/** Where the function_profiler hook writes its flame graph samples
 *  ("main;f;g 1234", in µs) when the profiler panel is on. WASM backend
 *  only, the jsoo worker can't hand back the file. */
export const PROFILE_FILE = "/tmp/mopsa-flamegraph.txt";
export const PROFILE_FLAGS = [
  "-hook",
  "function_profiler",
  "-flamegraph",
  PROFILE_FILE,
  "-flamegraph-resolution",
  "us",
];
