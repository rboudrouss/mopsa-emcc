import { FolderIcon, NetworkIcon, SlidersHorizontalIcon } from 'lucide-react';
import { DEFAULT_OPTION_VALUES } from '@/lib/options-schema';
import { useAppStore } from '@/lib/store';
import type { ActivePanel } from '@/lib/types';

export function ActivityBar() {
  const activePanel = useAppStore((s) => s.activePanel);
  const togglePanel = useAppStore((s) => s.togglePanel);
  const checks = useAppStore((s) => s.checks);
  const optionValues = useAppStore((s) => s.optionValues);

  const warnCount = checks.filter((c) => c.kind === 'warning' || c.kind === 'error').length;
  const optionCount = Object.entries(optionValues).filter(
    ([flag, val]) => val !== DEFAULT_OPTION_VALUES[flag]
  ).length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 8,
        gap: 4,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
      }}
    >
      <ActivityIcon
        icon={<FolderIcon size={20} />}
        panel="files"
        active={activePanel === 'files'}
        badge={warnCount > 0 ? warnCount : undefined}
        badgeColor="#f5b544"
        onClick={() => togglePanel('files')}
        title="Files"
      />
      <ActivityIcon
        icon={<NetworkIcon size={20} />}
        panel="domains"
        active={activePanel === 'domains'}
        onClick={() => togglePanel('domains')}
        title="Domains"
      />
      <ActivityIcon
        icon={<SlidersHorizontalIcon size={20} />}
        panel="options"
        active={activePanel === 'options'}
        badge={optionCount > 0 ? optionCount : undefined}
        badgeColor="#60a5fa"
        onClick={() => togglePanel('options')}
        title="Options"
      />
    </div>
  );
}

interface ActivityIconProps {
  icon: React.ReactNode;
  panel: Exclude<ActivePanel, null>;
  active: boolean;
  badge?: number | string;
  badgeColor?: string;
  onClick: () => void;
  title: string;
}

function ActivityIcon({ icon, active, badge, badgeColor, onClick, title }: ActivityIconProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 44,
        height: 40,
        background: 'none',
        border: 'none',
        borderLeft: active ? '2px solid #f5b544' : '2px solid transparent',
        borderRadius: 0,
        cursor: 'pointer',
        color: active ? '#f5b544' : 'var(--text-muted)',
        transition: 'color 120ms, border-color 120ms',
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
      }}
    >
      {icon}
      {badge !== undefined && (
        <span
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            minWidth: 14,
            height: 14,
            borderRadius: 7,
            background: badgeColor,
            color: '#0f1117',
            fontSize: 9,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 3px',
            lineHeight: 1,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
