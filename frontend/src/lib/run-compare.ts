import { create } from "zustand";
import type { CheckItem } from "./types";
import { readFile } from "./mopsa-client";
import { findFileByMopsaPath } from "./editor-nav";
import { useAppStore } from "./store";
import { getNodePath } from "./tree";

/**
 * Run comparison: each successful batch run is snapshotted, and the results
 * panel shows what changed against a baseline — the previous run, or a run
 * the user pinned (e.g. to compare two configs on the same code).
 *
 * Alarms are matched by check title + file + the source text of their range
 * (e.g. the faulty division) rather than the line number, so editing
 * elsewhere doesn't turn an alarm into a "gone + new" pair.
 */

export interface AlarmRef {
  key: string;
  title: string;
  kind: CheckItem["kind"];
  file: string;
  line: number;
}

export interface RunSnapshot {
  alarms: AlarmRef[];
  safe: number;
  total: number;
  time: number | null;
  /** Config preset (or "custom") and the changed options, for the label. */
  label: string;
  /** Workspace analyzed: runs of different workspaces aren't compared. */
  scope: string;
}

export interface RunDiff {
  added: AlarmRef[];
  removed: AlarmRef[];
}

interface CompareState {
  last: RunSnapshot | null;
  baseline: RunSnapshot | null;
  pinned: boolean;
  record: (snap: RunSnapshot) => void;
  pin: () => void;
  unpin: () => void;
}

export const useRunCompare = create<CompareState>((set, get) => ({
  last: null,
  baseline: null,
  pinned: false,
  record: (snap) => {
    const { last, pinned, baseline } = get();
    set({ last: snap, baseline: pinned ? baseline : last });
  },
  pin: () => set((s) => ({ pinned: true, baseline: s.last })),
  unpin: () => set({ pinned: false }),
}));

const lineCache = new Map<string, string[]>();

/** Source text of an alarm range (first line only when multi-line). */
function rangeText(c: CheckItem): string {
  const { start, end } = c.range;
  if (!start) return "";
  let lines = lineCache.get(start.file);
  if (!lines) {
    const id = findFileByMopsaPath(start.file);
    const path = id ? getNodePath(useAppStore.getState().fileTree, id) : null;
    lines = path ? readFile("/" + path).split("\n") : [];
    lineCache.set(start.file, lines);
  }
  const line = lines[start.line - 1] ?? "";
  const to = end && end.line === start.line ? end.column : line.length;
  return line.slice(Math.max(0, start.column - 1), to).trim();
}

export function alarmRef(c: CheckItem): AlarmRef | null {
  const start = c.range.start;
  if (!start || (c.kind !== "warning" && c.kind !== "error")) return null;
  const base = start.file.split("/").pop() ?? start.file;
  return {
    key: `${c.title}|${base}|${rangeText(c)}`,
    title: c.title,
    kind: c.kind,
    file: start.file,
    line: start.line,
  };
}

export function snapshotRun(
  checks: CheckItem[],
  time: number | null,
  label: string,
  scope: string,
): RunSnapshot {
  lineCache.clear();
  const alarms = checks
    .map(alarmRef)
    .filter((a): a is AlarmRef => a !== null);
  lineCache.clear();
  return {
    alarms,
    safe: checks.filter((c) => c.kind === "safe").length,
    total: checks.length,
    time,
    label,
    scope,
  };
}

/** Multiset difference: an alarm reported twice and now once is "removed" once. */
export function diffRuns(base: RunSnapshot, cur: RunSnapshot): RunDiff {
  const count = (list: AlarmRef[]) => {
    const m = new Map<string, AlarmRef[]>();
    for (const a of list) m.set(a.key, [...(m.get(a.key) ?? []), a]);
    return m;
  };
  const b = count(base.alarms);
  const c = count(cur.alarms);
  const added: AlarmRef[] = [];
  const removed: AlarmRef[] = [];
  for (const [k, list] of c)
    added.push(...list.slice(b.get(k)?.length ?? 0));
  for (const [k, list] of b)
    removed.push(...list.slice(c.get(k)?.length ?? 0));
  return { added, removed };
}
