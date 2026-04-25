import { ansiToSpans } from '@/lib/mopsa-client';

interface WarningsBoxProps {
  warnings: string;
}

export function WarningsBox({ warnings }: WarningsBoxProps) {
  if (!warnings) return null;

  // Split into paragraphs (blank-line separated), falling back to individual lines
  const rawBlocks = warnings.split(/\n\n+/);
  const blocks = rawBlocks.length > 1
    ? rawBlocks
    : warnings.split('\n');

  const nonEmptyBlocks = blocks.filter((b) => b.trim());
  if (nonEmptyBlocks.length === 0) return null;

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {nonEmptyBlocks.map((block, i) => {
          const spans = ansiToSpans(block);
          return (
            <pre
              key={i}
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
              {spans.map((span, j) => (
                <span key={j} className={span.cls || undefined}>
                  {span.text}
                </span>
              ))}
            </pre>
          );
        })}
      </div>
    </div>
  );
}
