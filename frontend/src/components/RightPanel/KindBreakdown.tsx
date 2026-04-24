import type { CheckItem } from '@/lib/types';

interface KindBreakdownProps {
  checks: CheckItem[];
}

export function KindBreakdown({ checks }: KindBreakdownProps) {
  if (checks.length === 0) return null;

  // Group by title
  const groups = new Map<string, { safe: number; warn: number; error: number }>();
  for (const c of checks) {
    const entry = groups.get(c.title) ?? { safe: 0, warn: 0, error: 0 };
    if (c.kind === 'safe') entry.safe++;
    else if (c.kind === 'warning') entry.warn++;
    else if (c.kind === 'error') entry.error++;
    groups.set(c.title, entry);
  }

  const sorted = [...groups.entries()].sort((a, b) => {
    const aTotal = a[1].warn + a[1].error;
    const bTotal = b[1].warn + b[1].error;
    return bTotal - aTotal;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {sorted.map(([title, counts]) => {
        const total = counts.safe + counts.warn + counts.error;
        const safePct = (counts.safe / total) * 100;
        const warnPct = (counts.warn / total) * 100;
        const errorPct = (counts.error / total) * 100;

        return (
          <div key={title} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  fontFamily: "'JetBrains Mono', monospace",
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '70%',
                }}
                title={title}
              >
                {title}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 4 }}>
                {counts.error > 0 && (
                  <span style={{ color: '#f87171', fontWeight: 600 }}>✕{counts.error}</span>
                )}
                {counts.warn > 0 && (
                  <span style={{ color: '#f5b544', fontWeight: 600 }}>⚠{counts.warn}</span>
                )}
                {counts.safe > 0 && (
                  <span style={{ color: '#4ade80' }}>✓{counts.safe}</span>
                )}
              </span>
            </div>
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: 'var(--bg-elevated)',
                overflow: 'hidden',
                display: 'flex',
              }}
            >
              {safePct > 0 && (
                <div style={{ width: `${safePct}%`, background: '#4ade80', borderRadius: '2px 0 0 2px' }} />
              )}
              {warnPct > 0 && (
                <div style={{ width: `${warnPct}%`, background: '#f5b544' }} />
              )}
              {errorPct > 0 && (
                <div style={{ width: `${errorPct}%`, background: '#f87171', borderRadius: '0 2px 2px 0' }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
