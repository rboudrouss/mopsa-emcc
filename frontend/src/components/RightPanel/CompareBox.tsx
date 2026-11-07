import { PinIcon, PinOffIcon } from "lucide-react";
import { diffRuns, useRunCompare, type AlarmRef } from "@/lib/run-compare";
import { revealInEditor } from "@/lib/editor-nav";

const MONO = "'JetBrains Mono', monospace";

/** Pins the last run as the baseline of the comparison, or unpins it. */
export function PinBaselineButton() {
  const pinned = useRunCompare((s) => s.pinned);
  const hasRun = useRunCompare((s) => s.last !== null);
  const pin = useRunCompare((s) => s.pin);
  const unpin = useRunCompare((s) => s.unpin);
  if (!hasRun && !pinned) return null;
  return (
    <button
      onClick={pinned ? unpin : pin}
      title={
        pinned
          ? "Compare with the previous run again"
          : "Pin this run: the next runs are compared with it (e.g. another config)"
      }
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        fontSize: 11,
        color: pinned ? "var(--color-accent)" : "var(--text-muted)",
      }}
    >
      {pinned ? <PinOffIcon size={11} /> : <PinIcon size={11} />}
      {pinned ? "Unpin" : "Pin as baseline"}
    </button>
  );
}

/**
 * What changed since the baseline run: selectivity, time, new and fixed
 * alarms. Hidden when nothing changed, unless a baseline is pinned.
 */
export function CompareBox() {
  const last = useRunCompare((s) => s.last);
  const baseline = useRunCompare((s) => s.baseline);
  const pinned = useRunCompare((s) => s.pinned);
  if (!last || !baseline || baseline === last) return null;
  if (baseline.scope !== last.scope) return null;

  const { added, removed } = diffRuns(baseline, last);
  const sameSel = baseline.safe === last.safe && baseline.total === last.total;
  if (!pinned && sameSel && added.length === 0 && removed.length === 0)
    return null;

  const dSafe = last.safe - baseline.safe;
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        fontSize: 12,
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
        Compared with the {pinned ? "pinned" : "previous"} run
        <span style={{ fontFamily: MONO }}> ({baseline.label})</span>
        {baseline.label !== last.label && (
          <>
            , now <span style={{ fontFamily: MONO }}>{last.label}</span>
          </>
        )}
      </div>
      <div style={{ display: "flex", gap: 16, color: "var(--text-secondary)" }}>
        <span>
          Safe {baseline.safe}/{baseline.total} → {last.safe}/{last.total}
          {dSafe !== 0 && (
            <span style={{ color: dSafe > 0 ? "#4ade80" : "#f87171" }}>
              {" "}
              ({dSafe > 0 ? "+" : ""}
              {dSafe})
            </span>
          )}
        </span>
        {baseline.time !== null && last.time !== null && (
          <span>
            {baseline.time.toFixed(2)}s → {last.time.toFixed(2)}s
          </span>
        )}
      </div>
      {added.length === 0 && removed.length === 0 && (
        <span style={{ color: "var(--text-muted)" }}>Same alarms.</span>
      )}
      <AlarmList alarms={added} sign="+" color="#f87171" what="new" />
      <AlarmList alarms={removed} sign="−" color="#4ade80" what="gone" />
    </div>
  );
}

function AlarmList({
  alarms,
  sign,
  color,
  what,
}: {
  alarms: AlarmRef[];
  sign: string;
  color: string;
  what: string;
}) {
  if (alarms.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ color, fontWeight: 600, fontSize: 11 }}>
        {sign} {alarms.length} {what} alarm{alarms.length > 1 ? "s" : ""}
      </span>
      {alarms.map((a, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 8,
            alignItems: "baseline",
            color: "var(--text-secondary)",
          }}
        >
          <span style={{ flex: 1 }}>{a.title}</span>
          <button
            onClick={() => revealInEditor(a.file, a.line)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontFamily: MONO,
              fontSize: 11,
              color: "var(--color-accent)",
            }}
          >
            {(a.file.split("/").pop() ?? a.file) + ":" + a.line}
          </button>
        </div>
      ))}
    </div>
  );
}
