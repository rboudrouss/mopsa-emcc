import { InfoIcon } from "lucide-react";
import type { Assumption } from "@/lib/types";
import { revealInEditor } from "@/lib/editor-nav";

const BLUE = "#60a5fa";

/**
 * Soundness assumptions of the analysis (ignored asm, undefined functions,
 * undetermined function pointers…): the results only hold under them, so
 * "no alarm" does not mean "no bug" when this list is not empty.
 */
export function AssumptionsBox({ assumptions }: { assumptions: Assumption[] }) {
  if (assumptions.length === 0) return null;
  return (
    <div
      style={{
        background: "color-mix(in srgb, #60a5fa 6%, transparent)",
        border: "1px solid color-mix(in srgb, #60a5fa 30%, transparent)",
        borderRadius: 6,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          fontWeight: 600,
          color: BLUE,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
        title="The results are sound only under these assumptions"
      >
        <InfoIcon size={12} />
        {assumptions.length} assumption{assumptions.length > 1 ? "s" : ""}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
        The results hold only under these hypotheses.
      </div>
      {assumptions.map((a, i) => {
        const start = a.range?.start;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              fontSize: 12,
              color: "var(--text-secondary)",
              lineHeight: 1.5,
            }}
          >
            <span style={{ flex: 1, wordBreak: "break-word" }}>{a.message}</span>
            {start ? (
              <button
                onClick={() => revealInEditor(start.file, start.line)}
                title="Go to the location"
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  color: BLUE,
                  flexShrink: 0,
                }}
              >
                {(start.file.split("/").pop() ?? start.file) + ":" + start.line}
              </button>
            ) : (
              <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
                global
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
