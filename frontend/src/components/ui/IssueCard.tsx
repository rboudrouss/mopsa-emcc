import type { CheckItem } from '@/lib/types';
import { inFile } from '@/lib/index';
import { IssueBadge } from './IssueBadge';

interface IssueCardProps {
  check: CheckItem;
  index: number;
  codeFilePath?: string;
  onClick?: () => void;
}

const KIND_COLOR: Record<string, { border: string; bg: string; bgHover: string }> = {
  error:   { border: '#f87171', bg: 'rgba(248,113,113,.04)', bgHover: 'rgba(248,113,113,.08)' },
  warning: { border: '#f5b544', bg: 'rgba(245,181,68,.04)',  bgHover: 'rgba(245,181,68,.08)' },
  safe:    { border: '#4ade80', bg: 'rgba(74,222,128,.04)',  bgHover: 'rgba(74,222,128,.08)' },
  info:    { border: '#60a5fa', bg: 'rgba(96,165,250,.04)',  bgHover: 'rgba(96,165,250,.08)' },
};

export function IssueCard({ check, index, codeFilePath, onClick }: IssueCardProps) {
  const { start } = check.range;
  const filename = start ? (start.file.split('/').pop() ?? start.file) : '?';
  const location = start ? `${filename}:${start.line}` : filename;
  const color = KIND_COLOR[check.kind] ?? KIND_COLOR.warning;

  const isCrossFile = codeFilePath && start && !inFile(start.file, codeFilePath);

  // Callstack frames that are in the current file (the call sites)
  const localFrames = codeFilePath
    ? check.callstack.filter((f) => f.range?.start && inFile(f.range.start.file, codeFilePath))
    : [];

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '8px 12px',
        borderLeft: `2px solid ${color.border}`,
        background: color.bg,
        borderRadius: '0 4px 4px 0',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 120ms',
      }}
      onMouseEnter={(e) => {
        if (onClick) (e.currentTarget as HTMLDivElement).style.background = color.bgHover;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = color.bg;
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
        {isCrossFile && localFrames.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 2 }}>
            {localFrames.map((f, i) => (
              <span
                key={i}
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  color: 'var(--text-muted)',
                }}
              >
                {'↳ '}
                <span style={{ color: 'var(--text-secondary)' }}>{f.function}</span>
                {f.range?.start && ` :${f.range.start.line}`}
                {' → '}
                <span style={{ color: color.border }}>{filename}:{start?.line}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
