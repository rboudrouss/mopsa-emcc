import type { CheckItem } from "@/lib/types";

interface StatTilesProps {
  checks: CheckItem[];
  selectivity: string | null;
  analysisTime: number | null;
}

interface TileProps {
  label: string;
  value: string | number;
  accent: string;
}

function Tile({ label, value, accent }: TileProps) {
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "var(--bg-elevated)",
        borderRadius: 8,
        borderLeft: `3px solid ${accent}`,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: "var(--text-primary)",
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </span>
    </div>
  );
}

export function StatTiles({
  checks,
  selectivity,
  analysisTime,
}: StatTilesProps) {
  const total = checks.length;
  const safe = checks.filter((c) => c.kind === "safe").length;
  const warnings = checks.filter((c) => c.kind === "warning").length;
  const errors = checks.filter((c) => c.kind === "error").length;

  const timeStr = analysisTime !== null ? `${analysisTime.toFixed(2)}s` : "—";
  const selStr = selectivity ?? "—";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <Tile label="Total" value={total} accent="#8891a8" />
      <Tile label="Safe" value={safe} accent="#4ade80" />
      <Tile label="Warnings" value={warnings} accent="#f5b544" />
      <Tile label="Errors" value={errors} accent="#f87171" />
      <Tile label="Selectivity" value={selStr} accent="#60a5fa" />
      <Tile label="Time" value={timeStr} accent="#a78bfa" />
    </div>
  );
}
