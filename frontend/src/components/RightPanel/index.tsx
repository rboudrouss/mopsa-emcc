import { XIcon, TriangleAlertIcon } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { KindBreakdown } from "./KindBreakdown";
import { RawOutput } from "./RawOutput";
import { OutputTerminal } from "./OutputTerminal";
import { StatTiles } from "./StatTiles";
import { WarningsBox } from "./WarningsBox";
import { InteractiveTerminal } from "./InteractiveTerminal";
import { DebugPanel } from "@/components/Debug/DebugPanel";

export function RightPanel({ isAnalyzing }: { isAnalyzing: boolean }) {
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
        <BackendNoticeBanner />
        {engine === "interactive" ? <InteractiveTerminal /> : <DebugPanel />}
      </div>
    );
  }

  // While analysing, hide the (now stale) summary behind a clear in-progress
  // view — a C+Python run can take ~20s. (Batch engine only; live ones above.)
  if (isAnalyzing) return <AnalyzingView />;

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
      <BackendNoticeBanner />

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

function AnalyzingView() {
  return (
    <div
      style={{
        height: "100%",
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--border)",
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
        Analysis in progress…
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          maxWidth: 260,
          lineHeight: 1.5,
        }}
      >
        Results will appear here once it finishes.
      </div>
    </div>
  );
}

/**
 * Amber, dismissable banner shown when a run was blocked because the
 * selected backend doesn't support it (set by checkBackendSupport, e.g. C
 * with the js_of_ocaml backend). Replaces the obscure "Could not parse
 * analysis output" / worker-error paths for that case.
 */
function BackendNoticeBanner() {
  const notice = useAppStore((s) => s.backendNotice);
  const setBackendNotice = useAppStore((s) => s.setBackendNotice);
  if (!notice) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "10px 12px",
        marginBottom: 4,
        background: "color-mix(in srgb, #f5b544 10%, transparent)",
        border: "1px solid color-mix(in srgb, #f5b544 45%, transparent)",
        borderRadius: 6,
        fontSize: 12,
        color: "var(--text-primary)",
        lineHeight: 1.5,
        flexShrink: 0,
      }}
    >
      <TriangleAlertIcon
        size={14}
        style={{ color: "#f5b544", flexShrink: 0, marginTop: 1 }}
      />
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 600, color: "#f5b544" }}>
          Not supported by this backend.{" "}
        </span>
        {notice}
      </div>
      <button
        onClick={() => setBackendNotice(null)}
        title="Dismiss"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text-muted)",
          padding: 2,
          flexShrink: 0,
          display: "flex",
        }}
      >
        <XIcon size={13} />
      </button>
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
