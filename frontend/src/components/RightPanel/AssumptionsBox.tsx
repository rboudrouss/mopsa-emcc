interface AssumptionsBoxProps {
  assumptions: unknown[];
}

export function AssumptionsBox({ assumptions }: AssumptionsBoxProps) {
  if (assumptions.length === 0) return null;

  return (
    <div
      style={{
        background: 'rgba(245,181,68,.06)',
        border: '1px solid rgba(245,181,68,.25)',
        borderRadius: 6,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#f5b544',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 4,
        }}
      >
        Assumptions ({assumptions.length})
      </div>
      {assumptions.map((a, i) => (
        <div
          key={i}
          style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {typeof a === 'string' ? a : JSON.stringify(a)}
        </div>
      ))}
    </div>
  );
}
