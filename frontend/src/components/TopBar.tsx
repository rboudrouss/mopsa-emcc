import { MoonIcon, PlayIcon, SunIcon, ZapIcon, ZapOffIcon } from "lucide-react";
import { PulseDot } from "@/components/ui/PulseDot";
import { useAppStore } from "@/lib/store";
import { EntryPointPicker } from "@/components/TopBar/EntryPointPicker";
import { EngineModePicker } from "@/components/TopBar/EngineModePicker";
import { Languages } from "lucide-react";
import { getActiveAnalysisMode } from "@/lib/tree";

interface TopBarProps {
  isAnalyzing: boolean;
  onRunClick: () => void;
  resolvedTheme: "light" | "dark";
  onThemeToggle: () => void;
}

export function TopBar({
  isAnalyzing,
  onRunClick,
  resolvedTheme,
  onThemeToggle,
}: TopBarProps) {
  const checks = useAppStore((s) => s.checks);
  const selectivity = useAppStore((s) => s.selectivity);
  const analysisTime = useAppStore((s) => s.analysisTime);
  const autoRun = useAppStore((s) => s.autoRun);
  const toggleAutoRun = useAppStore((s) => s.toggleAutoRun);
  const engine = useAppStore(
    (s) => (s.optionValues["-engine"] as string) ?? "automatic",
  );
  const fileTree = useAppStore((s) => s.fileTree);
  const activeFile = useAppStore((s) => s.activeFile);
  const lang = useAppStore((s) => s.lang);
  const isMultilang =
    getActiveAnalysisMode({
      fileTree,
      activeFile,
      lang,
    }) === "multilanguage";

  // Auto-run governs the automatic (re)runs: re-running the batch analysis in
  // automatic mode, and auto-(re)starting the REPL in interactive mode (once on
  // entry, then on every file switch). DAP runs one stepping session, so the
  // toggle stays locked off there.
  const lockedOff = engine === "dap";
  const autoRunActive = autoRun && !lockedOff;

  const safe = checks.filter((c) => c.kind === "safe").length;
  const total = checks.length;
  const warnings = checks.filter(
    (c) => c.kind === "warning" || c.kind === "error",
  ).length;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 16px",
        height: 48,
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border)",
        gridColumn: "1 / -1",
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}
      >
        <MopsaLogo />
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--text-primary)",
            letterSpacing: "-0.01em",
          }}
        >
          MOPSA
        </span>
      </div>

      {/* Divider between brand and the analysis-mode switcher */}
      <div
        style={{
          width: 1,
          height: 20,
          background: "var(--border)",
          flexShrink: 0,
        }}
      />

      {/* Analysis mode — reshapes the right-hand panel (batch / REPL / DAP) */}
      <EngineModePicker />

      {isMultilang && (
        <div
          title="Cross-language analysis (auto-detected from workspace)"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 8px",
            background: "color-mix(in srgb, #818cf8 15%, transparent)",
            border: "1px solid #818cf8",
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 500,
            color: "#818cf8",
            flexShrink: 0,
          }}
        >
          <Languages size={11} />
          Cross-language
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Stats */}
      {total > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 12,
            color: "var(--text-secondary)",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#4ade80", fontWeight: 500 }}>
            ✓ {safe}/{total}
          </span>
          {warnings > 0 && (
            <span style={{ color: "#f5b544", fontWeight: 500 }}>
              ⚠ {warnings}
            </span>
          )}
          {analysisTime !== null && (
            <span style={{ color: "var(--text-muted)" }}>
              ⏱ {analysisTime.toFixed(2)}s
            </span>
          )}
          {selectivity && (
            <span style={{ color: "var(--text-muted)" }}>{selectivity}</span>
          )}
        </div>
      )}

      <PulseDot active={isAnalyzing} label="Analyzing…" />

      <EntryPointPicker />

      {/* Auto-run toggle (locked off for DAP only) */}
      <button
        onClick={lockedOff ? undefined : toggleAutoRun}
        disabled={lockedOff}
        title={
          lockedOff
            ? `Auto-run is unavailable in ${engine} mode`
            : autoRun
              ? "Disable auto-run"
              : "Enable auto-run"
        }
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          background: autoRunActive
            ? "color-mix(in srgb, #f5b544 15%, transparent)"
            : "none",
          border: `1px solid ${autoRunActive ? "#f5b544" : "var(--border)"}`,
          borderRadius: 6,
          cursor: lockedOff ? "not-allowed" : "pointer",
          color: autoRunActive ? "#f5b544" : "var(--text-muted)",
          opacity: lockedOff ? 0.4 : 1,
          flexShrink: 0,
          transition: "all 150ms",
        }}
      >
        {autoRunActive ? <ZapIcon size={14} /> : <ZapOffIcon size={14} />}
      </button>

      {/* Run button */}
      <button
        onClick={onRunClick}
        disabled={isAnalyzing}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 14px",
          background: isAnalyzing ? "var(--bg-elevated)" : "#f5b544",
          color: isAnalyzing ? "var(--text-muted)" : "#0f1117",
          border: "none",
          borderRadius: 6,
          cursor: isAnalyzing ? "not-allowed" : "pointer",
          fontSize: 13,
          fontWeight: 600,
          transition: "background 150ms",
          flexShrink: 0,
        }}
      >
        <PlayIcon size={14} />
        Run
      </button>

      {/* Theme toggle */}
      <button
        onClick={onThemeToggle}
        title={
          resolvedTheme === "dark"
            ? "Switch to light mode"
            : "Switch to dark mode"
        }
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          background: "none",
          border: "1px solid var(--border)",
          borderRadius: 6,
          cursor: "pointer",
          color: "var(--text-secondary)",
          flexShrink: 0,
          transition: "color 120ms",
        }}
      >
        {resolvedTheme === "dark" ? (
          <SunIcon size={15} />
        ) : (
          <MoonIcon size={15} />
        )}
      </button>
    </div>
  );
}

function MopsaLogo() {
  return (
    <img
      src="/mopsa.png"
      alt="Mopsa"
      width={24}
      height={24}
      style={{ objectFit: "contain" }}
    />
  );
}
