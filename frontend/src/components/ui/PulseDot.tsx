interface PulseDotProps {
  active: boolean;
  label?: string;
}

export function PulseDot({ active, label }: PulseDotProps) {
  if (!active) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#f5b544",
          animation: "mopsa-pulse 1.5s ease-in-out infinite",
          flexShrink: 0,
        }}
      />
      {label && (
        <span style={{ fontSize: 12, color: "#f5b544", fontWeight: 500 }}>
          {label}
        </span>
      )}
    </span>
  );
}
