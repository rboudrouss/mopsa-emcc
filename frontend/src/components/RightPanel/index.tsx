import { XIcon, TriangleAlertIcon } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { KindBreakdown } from "./KindBreakdown";
import { RawOutput } from "./RawOutput";
import { OutputTerminal } from "./OutputTerminal";
import { StatTiles } from "./StatTiles";
import { WarningsBox } from "./WarningsBox";
import { InteractiveFold } from "./InteractiveFold";
import { StatesPanel } from "./StatesPanel";
import { ProfilePanel } from "./ProfilePanel";
import { AnalyzingView } from "./AnalyzingView";
import { CompareBox, PinBaselineButton } from "./CompareBox";
import { PanicDetails } from "./PanicDetails";
import { FoldHeader, useFold } from "./Fold";

export function RightPanel({ isAnalyzing }: { isAnalyzing: boolean }) {
  const rawOutput = useAppStore((s) => s.rawOutput);
  const format = useAppStore(
    (s) => (s.optionValues["-format"] as string) ?? "json",
  );

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

      {isAnalyzing ? (
        // Hide the (now stale) results behind a clear in-progress view: a
        // C+Python run can take ~20s.
        <div style={{ minHeight: 280, display: "flex", flexShrink: 0 }}>
          <AnalyzingView />
        </div>
      ) : format === "text" ? (
        // Text output is unparseable: show the raw terminal output directly.
        <div style={{ height: "60vh", display: "flex", flexShrink: 0 }}>
          <OutputTerminal raw={rawOutput} />
        </div>
      ) : (
        <Results />
      )}

      {/* Mounted whatever the state above, so a REPL session survives
          the re-runs of the batch analysis. */}
      <InteractiveFold />

      {!isAnalyzing && format !== "text" && <RawOutput raw={rawOutput} />}
    </div>
  );
}

function Results() {
  const checks = useAppStore((s) => s.checks);
  const panic = useAppStore((s) => s.panic);
  const warnings = useAppStore((s) => s.warnings);
  const rawOutput = useAppStore((s) => s.rawOutput);
  const selectivity = useAppStore((s) => s.selectivity);
  const analysisTime = useAppStore((s) => s.analysisTime);
  const analysisError = useAppStore((s) => s.analysisError);
  const analysisSuccess = useAppStore((s) => s.analysisSuccess);
  const profiler = useAppStore((s) => s.optionValues["__profiler"] === true);
  const ok = analysisSuccess === true && !analysisError;
  const [summaryOpen, toggleSummary] = useFold("summary", true);
  const [checksOpen, toggleChecks] = useFold("checks", true);

  return (
    <>
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
          {panic && <PanicDetails panic={panic} />}
        </div>
      )}

      {analysisSuccess === true && (
        <>
          <FoldHeader
            title="Summary"
            open={summaryOpen}
            onToggle={toggleSummary}
            actions={<PinBaselineButton />}
          />
          {summaryOpen && (
            <>
              <StatTiles
                checks={checks}
                selectivity={selectivity}
                analysisTime={analysisTime}
              />
              <CompareBox />
            </>
          )}
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
          <FoldHeader title="Checks" open={checksOpen} onToggle={toggleChecks} />
          {checksOpen && <KindBreakdown checks={checks} />}
        </>
      )}

      {ok && <StatesPanel />}

      {ok && profiler && <ProfilePanel />}

      {!analysisError && <WarningsBox warnings={warnings} />}
    </>
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
