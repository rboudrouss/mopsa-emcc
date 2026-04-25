import { ansiToSpans } from '@/lib/mopsa-client';

interface WarningsBoxProps {
  warnings: string;
}

export function WarningsBox({ warnings }: WarningsBoxProps) {
  if (!warnings) return null;

  const spans = ansiToSpans(warnings);

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
        Warnings
      </div>
      <pre
        style={{
          margin: 0,
          fontSize: 12,
          fontFamily: "'JetBrains Mono', monospace",
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}
      >
        {spans.map((span, i) => (
          <span key={i} className={span.cls || undefined}>
            {span.text}
          </span>
        ))}
      </pre>
    </div>
  );
}
