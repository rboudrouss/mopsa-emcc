import type { CheckItem } from '@/lib/types';
import { IssueBadge } from './IssueBadge';

interface IssueCardProps {
  check: CheckItem;
  index: number;
  onClick?: () => void;
}

export function IssueCard({ check, index, onClick }: IssueCardProps) {
  const { start } = check.range;
  const filename = start.file.split('/').pop() ?? start.file;
  const location = `${filename}:${start.line}.${start.column}`;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '8px 12px',
        borderLeft: '2px solid var(--color-warn)',
        background: 'rgba(245,181,68,.04)',
        borderRadius: '0 4px 4px 0',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 120ms',
      }}
      onMouseEnter={(e) => {
        if (onClick) (e.currentTarget as HTMLDivElement).style.background = 'rgba(245,181,68,.08)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'rgba(245,181,68,.04)';
      }}
    >
      <span style={{ color: 'var(--text-muted)', fontSize: 12, flexShrink: 0, paddingTop: 1 }}>
        #{index + 1}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: 'var(--text-secondary)',
            }}
          >
            {location}
          </span>
          <IssueBadge kind={check.kind} />
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-primary)',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {check.title}
          </span>
        </div>
        {check.messages && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
            {check.messages}
          </span>
        )}
      </div>
    </div>
  );
}
