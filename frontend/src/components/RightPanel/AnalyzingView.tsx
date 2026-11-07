import { useEffect, useState } from "react";
import { useProgress } from "@/lib/progress";

const MAX_FRAMES = 5;

/**
 * In-progress view of a batch analysis: elapsed time and, when Mopsa's
 * progress hook streams it, the call stack being analyzed with the share of
 * each function's statements already done.
 */
export function AnalyzingView() {
  const entries = useProgress((s) => s.entries);
  const startedAt = useProgress((s) => s.startedAt);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(t);
  }, []);
  const elapsed = startedAt === null ? 0 : (now - startedAt) / 1000;
  // The innermost frames tell where the analysis is; keep the outermost
  // one too: its percentage is the closest thing to a global progress.
  const shown =
    entries.length <= MAX_FRAMES
      ? entries
      : [entries[0], ...entries.slice(entries.length - (MAX_FRAMES - 1))];

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        boxSizing: "border-box",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "3px solid var(--border)",
          borderTopColor: "#f5b544",
          animation: "mopsa-spin 0.8s linear infinite",
        }}
      />
      <div style={{ fontSize: 15, fontWeight: 600, color: "#f5b544" }}>
        Analysis in progress… {elapsed.toFixed(1)}s
      </div>
      {shown.length === 0 ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            maxWidth: 260,
            lineHeight: 1.5,
          }}
        >
          Parsing the program and preparing the analysis…
        </div>
      ) : (
        <div
          style={{
            width: "100%",
            maxWidth: 320,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            textAlign: "left",
          }}
        >
          {shown.map((e, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div
                style={{
                  display: "flex",
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "var(--text-secondary)",
                }}
              >
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {i > 0 && entries.length > MAX_FRAMES && i === 1 ? "… › " : i > 0 ? "› " : ""}
                  {e.function}
                  {e.line > 0 && (
                    <span style={{ color: "var(--text-muted)" }}> line {e.line}</span>
                  )}
                </span>
                <span style={{ color: "var(--text-muted)" }}>{e.percent}%</span>
              </div>
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: "var(--bg-elevated)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, e.percent)}%`,
                    height: "100%",
                    background: "#f5b544",
                    transition: "width 150ms",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
