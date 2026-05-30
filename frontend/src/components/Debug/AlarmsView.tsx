import { useDebugStore } from "@/lib/store-debug";
import type { CheckItem } from "@/lib/types";
import { Section } from "./CallStackView";

const KIND_COLOR: Record<CheckItem["kind"], string> = {
  error: "#f87171",
  warning: "#f5b544",
  info: "#60a5fa",
  safe: "#4ade80",
};

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

/** Alarms reported by the DAP engine via `output` events (data.alarms). */
export function AlarmsView() {
  const alarms = useDebugStore((s) => s.alarms);
  if (alarms.length === 0) return null;

  return (
    <Section title={`Alarms (${alarms.length})`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {alarms.map((a, i) => {
          const loc = a.range.start;
          return (
            <div
              key={i}
              style={{
                borderLeft: `2px solid ${KIND_COLOR[a.kind]}`,
                padding: "2px 0 2px 8px",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ color: KIND_COLOR[a.kind], fontWeight: 600, fontSize: 12 }}>
                  {a.title}
                </span>
                {loc && (
                  <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                    {loc.file.split("/").pop()}:{loc.line}
                  </span>
                )}
              </div>
              {a.messages && (
                <span
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {stripAnsi(a.messages)}
                </span>
              )}
              {a.callstack.length > 0 && (
                <span style={{ color: "var(--text-muted)", fontSize: 10.5 }}>
                  via {a.callstack.map((f) => f.function).join(" → ")}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
