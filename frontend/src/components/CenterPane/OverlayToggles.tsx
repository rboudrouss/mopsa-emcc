import { useEditorNav, type InlineValuesMode } from "@/lib/editor-nav";

const WHERE: { value: InlineValuesMode; label: string }[] = [
  { value: "off", label: "Inline: off" },
  { value: "cursor", label: "Inline: cursor line" },
  { value: "all", label: "Inline: all lines" },
  { value: "before", label: "Inline: before each line" },
  { value: "after", label: "Inline: after each line" },
];

/** Tab-bar switches of the editor overlays fed by the analysis states. */
export function OverlayToggles() {
  const showCoverage = useEditorNav((s) => s.showCoverage);
  const setShowCoverage = useEditorNav((s) => s.setShowCoverage);
  const showSafe = useEditorNav((s) => s.showSafe);
  const setShowSafe = useEditorNav((s) => s.setShowSafe);
  const inlineValues = useEditorNav((s) => s.inlineValues);
  const setInlineValues = useEditorNav((s) => s.setInlineValues);
  const on = inlineValues !== "off";

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
      <Select
        on={on}
        value={inlineValues}
        options={WHERE}
        onChange={setInlineValues}
        title={
          "Abstract values at the end of the lines, of the variables each line uses. " +
          "The eyes of the Domains panel choose the domains shown.\n" +
          "Before / after each line: the state before the line, or after it.\n" +
          "Cursor line, all lines: the state after the line, and the values the next " +
          "line changes as they are before it (i = 0 → [0,9]). The relations: the " +
          "ones the line brings."
        }
      />
    </div>
  );
}

function Select<T extends string>({
  on,
  value,
  options,
  onChange,
  title,
}: {
  on: boolean;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  title: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      title={title}
      style={{ ...toggleStyle(on), padding: "2px 4px", fontFamily: "inherit" }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
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
