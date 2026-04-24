import { ansiToSpans } from '@/lib/mopsa-client';

interface RawOutputProps {
  raw: string;
}

export function RawOutput({ raw }: RawOutputProps) {
  if (!raw) return null;

  const spans = ansiToSpans(raw);

  return (
    <details style={{ display: 'flex', flexDirection: 'column' }}>
      <summary
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          cursor: 'pointer',
          userSelect: 'none',
          padding: '4px 0',
          listStyle: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>▶</span>
        Raw Output
      </summary>
      <pre
        style={{
          marginTop: 8,
          padding: '10px 12px',
          background: 'var(--bg-elevated)',
          borderRadius: 6,
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          lineHeight: 1.6,
          overflowX: 'auto',
          overflowY: 'auto',
          maxHeight: 400,
          color: 'var(--text-secondary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {spans.map((span, i) => (
          <span key={i} className={span.cls || undefined}>
            {span.text}
          </span>
        ))}
      </pre>
    </details>
  );
}
