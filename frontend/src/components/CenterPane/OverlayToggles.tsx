import { useEditorNav, type InlineValuesMode } from "@/lib/editor-nav";

const NEXT: Record<InlineValuesMode, InlineValuesMode> = {
  off: "cursor",
  cursor: "all",
  all: "off",
};

const VALUES_LABEL: Record<InlineValuesMode, string> = {
  off: "Values: off",
  cursor: "Values: cursor line",
  all: "Values: all lines",
};

/** Tab-bar switches of the editor overlays fed by the analysis states. */
export function OverlayToggles() {
  const showCoverage = useEditorNav((s) => s.showCoverage);
  const setShowCoverage = useEditorNav((s) => s.setShowCoverage);
  const inlineValues = useEditorNav((s) => s.inlineValues);
  const showSafe = useEditorNav((s) => s.showSafe);
  const setShowSafe = useEditorNav((s) => s.setShowSafe);
  const setInlineValues = useEditorNav((s) => s.setInlineValues);

  return (
    <div style={{ display: "flex", gap: 4, padding: "0 8px" }}>
      <Toggle
        on={showCoverage}
        onClick={() => setShowCoverage(!showCoverage)}
        title="Mark the lines the analysis reached (green bar) and the unreachable ones (grey)"
      >
        Coverage
      </Toggle>
      <Toggle
        on={showSafe}
        onClick={() => setShowSafe(!showSafe)}
        title="Mark the lines whose checks Mopsa proved safe (green dot, details on hover)"
      >
        Safe checks
      </Toggle>
      <Toggle
        on={inlineValues !== "off"}
        onClick={() => setInlineValues(NEXT[inlineValues])}
        title="Abstract values at the end of the lines (click to cycle: off, cursor line, all lines)"
      >
        {VALUES_LABEL[inlineValues]}
      </Toggle>
    </div>
  );
}

function Toggle({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: "2px 8px",
        fontSize: 11,
        borderRadius: 4,
        cursor: "pointer",
        background: on ? "color-mix(in srgb, #f5b544 12%, transparent)" : "none",
        border: `1px solid ${on ? "color-mix(in srgb, #f5b544 50%, transparent)" : "var(--border)"}`,
        color: on ? "var(--color-accent)" : "var(--text-muted)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}
