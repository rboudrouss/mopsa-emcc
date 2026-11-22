/** The on/off switch of the Options and Domains panels. */
export function Switch({
  checked,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      aria-label={label}
      style={{
        width: 32,
        height: 18,
        borderRadius: 9,
        background: checked ? "var(--color-accent)" : "var(--bg-elevated)",
        border: `1px solid ${checked ? "var(--color-accent)" : "var(--border)"}`,
        cursor: disabled ? "default" : "pointer",
        position: "relative",
        transition: "background 150ms, border-color 150ms",
        flexShrink: 0,
        padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 14 : 2,
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: checked ? "#0f1117" : "var(--text-muted)",
          transition: "left 150ms",
        }}
      />
    </button>
  );
}
