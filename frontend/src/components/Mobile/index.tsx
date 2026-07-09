import { useEffect, useRef, useState } from "react";
import { CenterPane } from "@/components/CenterPane";
import { RightPanel } from "@/components/RightPanel";
import { DomainsPanel } from "@/components/SecondarySidebar/DomainsPanel";
import { FilesPanel } from "@/components/SecondarySidebar/FilesPanel";
import { OptionsPanel } from "@/components/SecondarySidebar/OptionsPanel";
import { useAppStore } from "@/lib/store";
import { BottomDock } from "./BottomDock";
import { BottomSheet } from "./BottomSheet";
import { MobileTopBar } from "./MobileTopBar";

export type MobileSheet = "files" | "domains" | "options" | null;

interface MobileLayoutProps {
  isAnalyzing: boolean;
  onRunClick: () => void;
  resolvedTheme: "light" | "dark";
  onThemeToggle: () => void;
}

/**
 * Single-column phone layout (<768px): thin top bar + status strip, a
 * Source / Config / Results tab switcher, and a bottom dock opening the
 * sidebar panels as slide-up sheets. Shares the store with the desktop
 * layout, so switching between the two loses no state.
 */
export function MobileLayout({
  isAnalyzing,
  onRunClick,
  resolvedTheme,
  onThemeToggle,
}: MobileLayoutProps) {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const configDirty = useAppStore((s) => s.configDirty);
  const checks = useAppStore((s) => s.checks);
  const activeFile = useAppStore((s) => s.activeFile);
  const engine = useAppStore(
    (s) => (s.optionValues["-engine"] as string) ?? "automatic",
  );

  // "Results" is a mobile-only third tab layered over the store's
  // source/config pair; the desktop layout shows results side-by-side.
  const [showResults, setShowResults] = useState(false);
  const [sheet, setSheet] = useState<MobileSheet>(null);

  // Picking a file from the Files sheet should land the user on the code:
  // close the sheet and leave the Results overlay.
  const prevFile = useRef(activeFile);
  useEffect(() => {
    if (activeFile === prevFile.current) return;
    prevFile.current = activeFile;
    setSheet(null);
    setShowResults(false);
  }, [activeFile]);

  const warnCount = checks.filter(
    (c) => c.kind === "warning" || c.kind === "error",
  ).length;

  const currentTab = showResults ? "results" : activeTab;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        width: "100vw",
        overflow: "hidden",
        background: "var(--bg-base)",
      }}
    >
      <MobileTopBar
        isAnalyzing={isAnalyzing}
        resolvedTheme={resolvedTheme}
        onThemeToggle={onThemeToggle}
      />

      {/* Segmented tab switcher */}
      <div
        style={{
          display: "flex",
          gap: 2,
          padding: 3,
          margin: "8px 10px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          flexShrink: 0,
        }}
      >
        <SegmentTab
          label="Source"
          active={currentTab === "source"}
          onClick={() => {
            setShowResults(false);
            setActiveTab("source");
          }}
        />
        <SegmentTab
          label={
            engine === "interactive"
              ? "REPL"
              : engine === "dap"
                ? "Debug"
                : "Results"
          }
          active={currentTab === "results"}
          badge={
            engine === "automatic" && warnCount > 0 ? warnCount : undefined
          }
          pulse={isAnalyzing}
          accent={engine !== "automatic"}
          onClick={() => setShowResults(true)}
        />
        <SegmentTab
          label="Config"
          active={currentTab === "config"}
          dirty={configDirty}
          onClick={() => {
            setShowResults(false);
            setActiveTab("config");
          }}
        />
      </div>

      {/* Content: both panes stay mounted so Monaco state and live terminal
          sessions (REPL / DAP) survive tab switches. */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <div
          style={{
            height: "100%",
            display: showResults ? "none" : "flex",
            flexDirection: "column",
          }}
        >
          <CenterPane resolvedTheme={resolvedTheme} hideTabBar />
        </div>
        <div
          style={{
            height: "100%",
            display: showResults ? "flex" : "none",
            flexDirection: "column",
          }}
        >
          <RightPanel isAnalyzing={isAnalyzing} />
        </div>
      </div>

      <BottomDock
        sheet={sheet}
        onSheetToggle={(s) => setSheet((cur) => (cur === s ? null : s))}
        isAnalyzing={isAnalyzing}
        onRunClick={onRunClick}
      />

      {sheet && (
        <BottomSheet onClose={() => setSheet(null)}>
          {sheet === "files" && <FilesPanel />}
          {sheet === "domains" && <DomainsPanel />}
          {sheet === "options" && <OptionsPanel />}
        </BottomSheet>
      )}
    </div>
  );
}

interface SegmentTabProps {
  label: string;
  active: boolean;
  badge?: number;
  dirty?: boolean;
  // Amber pulsing dot: analysis in progress.
  pulse?: boolean;
  // Amber tint: a live engine (REPL / DAP) owns this tab's surface.
  accent?: boolean;
  onClick: () => void;
}

function SegmentTab({
  label,
  active,
  badge,
  dirty,
  pulse,
  accent,
  onClick,
}: SegmentTabProps) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        height: 32,
        background: active
          ? "var(--bg-elevated)"
          : accent
            ? "color-mix(in srgb, #f5b544 8%, transparent)"
            : "transparent",
        color: accent
          ? "#f5b544"
          : active
            ? "var(--text-primary)"
            : "var(--text-muted)",
        border: `1px solid ${
          accent
            ? "color-mix(in srgb, #f5b544 45%, transparent)"
            : "transparent"
        }`,
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        boxShadow: active ? "0 1px 2px rgba(0,0,0,0.18)" : "none",
      }}
    >
      {label}
      {pulse && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: "#f5b544",
            animation: "mopsa-pulse 1s ease-in-out infinite",
            flexShrink: 0,
          }}
        />
      )}
      {badge !== undefined && (
        <span
          style={{
            minWidth: 14,
            height: 14,
            borderRadius: 7,
            background: "#f5b544",
            color: "#0f1117",
            fontSize: 9,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 3px",
            lineHeight: 1,
          }}
        >
          {badge}
        </span>
      )}
      {dirty && (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: 3,
            background: "#f5b544",
          }}
        />
      )}
    </button>
  );
}
