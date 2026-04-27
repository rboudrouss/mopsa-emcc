import { useAppStore } from '@/lib/store';
import { getCodeFilePath } from '@/lib/mopsa-client';
import { findById } from '@/lib/tree';
import { IssueCard } from '@/components/ui/IssueCard';
import { CodeEditor } from './CodeEditor';
import { ConfigEditor } from './ConfigEditor';

interface CenterPaneProps {
  resolvedTheme: 'light' | 'dark';
}

export function CenterPane({ resolvedTheme }: CenterPaneProps) {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const checks = useAppStore((s) => s.checks);
  const fileTree = useAppStore((s) => s.fileTree);
  const activeFile = useAppStore((s) => s.activeFile);

  const codeFilePath = getCodeFilePath();
  const localChecks = checks.filter(
    (c) => c.range?.start && (c.range.start.file === codeFilePath || c.range.start.file.endsWith(codeFilePath.replace(/^\//, '')))
  );
  const warnChecks = localChecks.filter((c) => c.kind === 'warning' || c.kind === 'error');

  const fileName = (activeFile ? findById(fileTree, activeFile)?.name : null) ?? 'untitled';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-base)',

        borderLeft: '1px solid var(--border)',
        borderRight: '1px solid var(--border)',
        boxSizing: 'border-box',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <Tab
          label={fileName}
          active={activeTab === 'source'}
          onClick={() => setActiveTab('source')}
        />
        <Tab
          label="config.json"
          active={activeTab === 'config'}
          onClick={() => setActiveTab('config')}
        />
      </div>

      {/* Editor area */}
      <div style={{ flex: 1 }}>
        {activeTab === 'source' ? (
          <CodeEditor resolvedTheme={resolvedTheme} />
        ) : (
          <ConfigEditor resolvedTheme={resolvedTheme} />
        )}
      </div>

      {/* Issue strip */}
      {warnChecks.length > 0 && (
        <div
          style={{
            flexShrink: 0,
            maxHeight: 200,
            overflowY: 'auto',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            padding: '4px 8px',
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              padding: '4px 4px 2px',
            }}
          >
            {warnChecks.length} issue{warnChecks.length !== 1 ? 's' : ''}
          </div>
          {warnChecks.map((check, i) => (
            <IssueCard key={i} check={check} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

interface TabProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function Tab({ label, active, onClick }: TabProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '8px 16px',
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
        borderRadius: 0,
        cursor: 'pointer',
        fontSize: 12,
        fontFamily: "'JetBrains Mono', monospace",
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        fontWeight: active ? 500 : 400,
        transition: 'color 120ms, border-color 120ms',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}
