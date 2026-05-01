interface IssueBadgeProps {
  kind: "safe" | "warning" | "error" | "info";
  className?: string;
}

const KIND_STYLES = {
  safe: { bg: "rgba(74,222,128,.15)", color: "#4ade80", label: "safe" },
  warning: { bg: "rgba(245,181,68,.15)", color: "#f5b544", label: "warn" },
  error: { bg: "rgba(248,113,113,.15)", color: "#f87171", label: "error" },
  info: { bg: "rgba(96,165,250,.15)", color: "#60a5fa", label: "info" },
};

export function IssueBadge({ kind, className }: IssueBadgeProps) {
  const s = KIND_STYLES[kind];
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
        background: s.bg,
        color: s.color,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {s.label}
    </span>
  );
}
