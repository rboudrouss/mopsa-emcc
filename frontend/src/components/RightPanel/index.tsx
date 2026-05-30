import { useAppStore } from "@/lib/store";
import { KindBreakdown } from "./KindBreakdown";
import { RawOutput } from "./RawOutput";
import { OutputTerminal } from "./OutputTerminal";
import { StatTiles } from "./StatTiles";
import { WarningsBox } from "./WarningsBox";
import { InteractiveTerminal } from "./InteractiveTerminal";
import { DebugPanel } from "@/components/Debug/DebugPanel";

export function RightPanel() {
  const checks = useAppStore((s) => s.checks);
  const warnings = useAppStore((s) => s.warnings);
  const rawOutput = useAppStore((s) => s.rawOutput);
  const selectivity = useAppStore((s) => s.selectivity);
  const analysisTime = useAppStore((s) => s.analysisTime);
  const analysisError = useAppStore((s) => s.analysisError);
  const analysisSuccess = useAppStore((s) => s.analysisSuccess);
  const engine = useAppStore(
    (s) => (s.optionValues["-engine"] as string) ?? "automatic",
  );
  const format = useAppStore(
    (s) => (s.optionValues["-format"] as string) ?? "json",
  );

  // Live engines replace the results view with their own surface.
  if (engine === "interactive" || engine === "dap") {
    return (
      <div
        style={{
          height: "100%",
          background: "var(--bg-surface)",
          borderLeft: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          padding: 16,
          boxSizing: "border-box",
        }}
      >
        {engine === "interactive" ? <InteractiveTerminal /> : <DebugPanel />}
      </div>
    );
  }

  // Text output is unparseable, so skip the results panel and show the raw
  // terminal output directly (no summary, no checks, no "analysis failed").
  if (format === "text") {
    return (
      <div
        style={{
          height: "100%",
          background: "var(--bg-surface)",
          borderLeft: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          padding: 16,
          boxSizing: "border-box",
        }}
      >
        <OutputTerminal raw={rawOutput} />
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100%",
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--border)",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      {analysisError && (
        <div
          style={{
            padding: "10px 12px",
            background: "rgba(248,113,113,.08)",
            border: "1px solid rgba(248,113,113,.3)",
            borderRadius: 6,
            fontSize: 12,
            color: "#f87171",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <span style={{ fontWeight: 600 }}>
            Analysis failed, see Raw output below
          </span>
          <span
            style={{
              color: "var(--text-secondary)",
              fontFamily: "var(--font-code, monospace)",
              wordBreak: "break-word",
            }}
          >
            {analysisError}
          </span>
        </div>
      )}

      {analysisSuccess === true && (
        <>
          <SectionHeader title="Summary" />
          <StatTiles
            checks={checks}
            selectivity={selectivity}
            analysisTime={analysisTime}
          />
        </>
      )}

      {analysisSuccess === null && !rawOutput && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            textAlign: "center",
            paddingTop: 32,
          }}
        >
          Run analysis to see results
        </div>
      )}

      {checks.length > 0 && (
        <>
          <SectionHeader title="Checks" />
          <KindBreakdown checks={checks} />
        </>
      )}

      {!analysisError && <WarningsBox warnings={warnings} />}

      <RawOutput raw={rawOutput} />
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {title}
    </div>
  );
}
