import {
  FolderIcon,
  NetworkIcon,
  PlayIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { DEFAULT_OPTION_VALUES } from "@/lib/options-schema";
import { useAppStore } from "@/lib/store";
import type { MobileSheet } from "./index";

interface BottomDockProps {
  sheet: MobileSheet;
  onSheetToggle: (sheet: Exclude<MobileSheet, null>) => void;
  isAnalyzing: boolean;
  onRunClick: () => void;
}

/**
 * Mobile bottom dock: the ActivityBar panels as sheet triggers + the primary
 * Run button. Touch targets are 44px tall.
 */
export function BottomDock({
  sheet,
  onSheetToggle,
  isAnalyzing,
  onRunClick,
}: BottomDockProps) {
  const checks = useAppStore((s) => s.checks);
  const optionValues = useAppStore((s) => s.optionValues);

  const warnCount = checks.filter(
    (c) => c.kind === "warning" || c.kind === "error",
  ).length;
  const optionCount = Object.entries(optionValues).filter(
    ([flag, val]) => val !== DEFAULT_OPTION_VALUES[flag],
  ).length;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 8px calc(6px + env(safe-area-inset-bottom))",
        background: "var(--bg-surface)",
        borderTop: "1px solid var(--border)",
        flexShrink: 0,
      }}
    >
      <DockButton
        label="Files"
        icon={<FolderIcon size={16} />}
        active={sheet === "files"}
        badge={warnCount > 0 ? warnCount : undefined}
        badgeColor="#f5b544"
        onClick={() => onSheetToggle("files")}
      />
      <DockButton
        label="Domains"
        icon={<NetworkIcon size={16} />}
        active={sheet === "domains"}
        onClick={() => onSheetToggle("domains")}
      />
      <DockButton
        label="Options"
        icon={<SlidersHorizontalIcon size={16} />}
        active={sheet === "options"}
        badge={optionCount > 0 ? optionCount : undefined}
        badgeColor="#60a5fa"
        onClick={() => onSheetToggle("options")}
      />

      <button
        onClick={onRunClick}
        disabled={isAnalyzing}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          height: 44,
          padding: "0 18px",
          background: isAnalyzing ? "var(--bg-elevated)" : "#f5b544",
          color: isAnalyzing ? "var(--text-muted)" : "#0f1117",
          border: "none",
          borderRadius: 8,
          cursor: isAnalyzing ? "not-allowed" : "pointer",
          fontSize: 13,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        <PlayIcon size={14} />
        Run
      </button>
    </div>
  );
}

interface DockButtonProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge?: number;
  badgeColor?: string;
  onClick: () => void;
}

function DockButton({
  label,
  icon,
  active,
  badge,
  badgeColor,
  onClick,
}: DockButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "relative",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        height: 44,
        background: active ? "var(--bg-elevated)" : "none",
        border: `1px solid ${active ? "var(--border)" : "transparent"}`,
        borderRadius: 8,
        cursor: "pointer",
        color: active ? "#f5b544" : "var(--text-muted)",
      }}
    >
      {icon}
      <span style={{ fontSize: 9.5 }}>{label}</span>
      {badge !== undefined && (
        <span
          style={{
            position: "absolute",
            top: 3,
            right: "50%",
            transform: "translateX(18px)",
            minWidth: 14,
            height: 14,
            borderRadius: 7,
            background: badgeColor,
            color: "#0f1117",
            fontSize: 9,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 3px",
            lineHeight: 1,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
