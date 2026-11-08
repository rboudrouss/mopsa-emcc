import { useEditorNav, type InlineValuesMode } from "@/lib/editor-nav";
import { useAppStore } from "@/lib/store";

const VALUES: { mode: InlineValuesMode; label: string }[] = [
  { mode: "off", label: "Values: off" },
  { mode: "cursor", label: "Values: cursor line" },
  { mode: "all", label: "Values: all lines" },
  { mode: "before", label: "Values: only before" },
  { mode: "after", label: "Values: only after" },
  { mode: "relations", label: "Values: relations" },
];

/** Tab-bar switches of the editor overlays fed by the analysis states. */
export function OverlayToggles() {
  const showCoverage = useEditorNav((s) => s.showCoverage);
  const setShowCoverage = useEditorNav((s) => s.setShowCoverage);
  const inlineValues = useEditorNav((s) => s.inlineValues);
  const showSafe = useEditorNav((s) => s.showSafe);
  const setShowSafe = useEditorNav((s) => s.setShowSafe);
  const setInlineValues = useEditorNav((s) => s.setInlineValues);
  // Relations need a relational numeric domain in the config.
  const relational = useAppStore((s) => s.configText.includes("numeric.relational"));

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
      <select
        value={inlineValues}
        onChange={(e) => setInlineValues(e.target.value as InlineValuesMode)}
        title={
          "Abstract values at the end of the lines: on the cursor line or every line, " +
          "the state after each line and what the next one changes; or only the " +
          "state before, or only the state after, each line; or the relations " +
          "between variables each line brings (with a relational config)"
        }
        style={{ ...toggleStyle(inlineValues !== "off"), padding: "2px 4px", fontFamily: "inherit" }}
      >
        {VALUES.map(({ mode, label }) => (
          <option key={mode} value={mode} disabled={mode === "relations" && !relational}>
            {mode === "relations" && !relational ? label + " (needs a relational config)" : label}
          </option>
        ))}
      </select>
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
    <button onClick={onClick} title={title} style={toggleStyle(on)}>
      {children}
    </button>
  );
}

function toggleStyle(on: boolean): React.CSSProperties {
  return {
    padding: "2px 8px",
    fontSize: 11,
    borderRadius: 4,
    cursor: "pointer",
    background: on ? "color-mix(in srgb, #f5b544 12%, transparent)" : "none",
    border: `1px solid ${on ? "color-mix(in srgb, #f5b544 50%, transparent)" : "var(--border)"}`,
    color: on ? "var(--color-accent)" : "var(--text-muted)",
    whiteSpace: "nowrap",
  };
}
