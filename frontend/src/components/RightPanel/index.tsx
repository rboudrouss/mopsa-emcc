import { useAppStore } from '@/lib/store';
import { AssumptionsBox } from './AssumptionsBox';
import { KindBreakdown } from './KindBreakdown';
import { RawOutput } from './RawOutput';
import { StatTiles } from './StatTiles';

export function RightPanel() {
  const checks = useAppStore((s) => s.checks);
  const assumptions = useAppStore((s) => s.assumptions);
  const rawOutput = useAppStore((s) => s.rawOutput);
  const selectivity = useAppStore((s) => s.selectivity);
  const analysisTime = useAppStore((s) => s.analysisTime);

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 16,
      }}
    >
      <SectionHeader title="Summary" />
      <StatTiles checks={checks} selectivity={selectivity} analysisTime={analysisTime} />

      {checks.length > 0 && (
        <>
          <SectionHeader title="Checks" />
          <KindBreakdown checks={checks} />
        </>
      )}

      <AssumptionsBox assumptions={assumptions} />

      <RawOutput raw={rawOutput} />
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
    >
      {title}
    </div>
  );
}
