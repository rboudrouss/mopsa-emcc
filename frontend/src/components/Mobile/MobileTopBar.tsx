import {
  Languages,
  MoonIcon,
  SunIcon,
  ZapIcon,
  ZapOffIcon,
} from "lucide-react";
import { PulseDot } from "@/components/ui/PulseDot";
import { EngineModePicker } from "@/components/TopBar/EngineModePicker";
import { EntryPointPicker } from "@/components/TopBar/EntryPointPicker";
import { useAppStore } from "@/lib/store";
import { findById, getActiveAnalysisMode } from "@/lib/tree";

interface MobileTopBarProps {
  isAnalyzing: boolean;
  resolvedTheme: "light" | "dark";
  onThemeToggle: () => void;
}

/**
 * Mobile header: a thin brand bar (logo + engine picker + auto-run + theme)
 * followed by a status strip (language, active file, entry point, run stats).
 * The Run button lives in the bottom dock.
 */
export function MobileTopBar({
  isAnalyzing,
  resolvedTheme,
  onThemeToggle,
}: MobileTopBarProps) {
  const autoRun = useAppStore((s) => s.autoRun);
  const toggleAutoRun = useAppStore((s) => s.toggleAutoRun);
  const engine = useAppStore(
    (s) => (s.optionValues["-engine"] as string) ?? "automatic",
  );

  const lockedOff = engine === "dap";
  const autoRunActive = autoRun && !lockedOff;

  return (
    <>
      {/* Brand bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 10px",
          height: 44,
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <img
          src="/mopsa.png"
          alt="Mopsa"
          width={22}
          height={22}
          style={{ objectFit: "contain", flexShrink: 0 }}
        />

        <EngineModePicker compact />

        <div style={{ flex: 1 }} />

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
          }}
        >
          {autoRunActive ? <ZapIcon size={14} /> : <ZapOffIcon size={14} />}
        </button>

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
          }}
        >
          {resolvedTheme === "dark" ? (
            <SunIcon size={15} />
          ) : (
            <MoonIcon size={15} />
          )}
        </button>
      </div>

      <StatusStrip isAnalyzing={isAnalyzing} />
    </>
  );
}

const LANG_ABBREV: Record<string, string> = {
  c: "c",
  python: "py",
  universal: "uni",
};

function StatusStrip({ isAnalyzing }: { isAnalyzing: boolean }) {
  const checks = useAppStore((s) => s.checks);
  const selectivity = useAppStore((s) => s.selectivity);
  const analysisTime = useAppStore((s) => s.analysisTime);
  const lang = useAppStore((s) => s.lang);
  const fileTree = useAppStore((s) => s.fileTree);
  const activeFile = useAppStore((s) => s.activeFile);

  const isMultilang =
    getActiveAnalysisMode({ fileTree, activeFile, lang }) === "multilanguage";

  const fileName =
    (activeFile ? findById(fileTree, activeFile)?.name : null) ?? "untitled";

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
        gap: 8,
        padding: "0 10px",
        height: 32,
        background: "var(--bg-base)",
        borderBottom: "1px solid var(--border)",
        fontSize: 11,
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      <span
        style={{
          padding: "1px 6px",
          borderRadius: 4,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          color: "var(--text-secondary)",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          flexShrink: 0,
        }}
      >
        {LANG_ABBREV[lang] ?? lang}
      </span>

      {isMultilang && (
        <Languages
          size={12}
          style={{ color: "#818cf8", flexShrink: 0 }}
          aria-label="Cross-language analysis"
        />
      )}

      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: "var(--text-secondary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {fileName}
      </span>

      <div style={{ flex: 1 }} />

      {total > 0 && (
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--text-secondary)",
            flexShrink: 0,
            fontSize: 11,
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
              {analysisTime.toFixed(2)}s
            </span>
          )}
          {selectivity && (
            <span style={{ color: "var(--text-muted)" }}>{selectivity}</span>
          )}
        </span>
      )}

      <PulseDot active={isAnalyzing} label="" />

      <EntryPointPicker />
    </div>
  );
}
