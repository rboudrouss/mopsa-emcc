import { useState } from "react";
import type { DebugControls } from "@/lib/hooks/use-debug-session";
import { Section } from "./CallStackView";

interface Watch {
  expr: string;
  value: string;
}

export function WatchPanel({ controls }: { controls: DebugControls }) {
  const [expr, setExpr] = useState("");
  const [watches, setWatches] = useState<Watch[]>([]);

  const submit = async () => {
    const e = expr.trim();
    if (!e) return;
    setExpr("");
    const idx = watches.length;
    setWatches((w) => [...w, { expr: e, value: "…" }]);
    const value = await controls.evaluateWatch(e);
    setWatches((w) => w.map((it, i) => (i === idx ? { ...it, value } : it)));
  };

  return (
    <Section title="Watch / evaluate">
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder="variable name(s)"
          style={{
            flex: 1,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            color: "var(--text-primary)",
            fontSize: 12,
            padding: "4px 8px",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
        {watches.map((w, i) => (
          <div
            key={i}
            style={{
              fontSize: 12,
              display: "flex",
              gap: 6,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            <span style={{ color: "var(--text-primary)" }}>{w.expr}</span>
            <span style={{ color: "var(--text-secondary)" }}>= {w.value}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}
