import { ExternalLinkIcon } from 'lucide-react';
import { DomainNode } from '@/components/ui/DomainNode';
import { parseConfigText } from '@/lib/mopsa-client';
import { useAppStore } from '@/lib/store';

export function DomainsPanel() {
  const configText = useAppStore((s) => s.configText);
  const configPreset = useAppStore((s) => s.configPreset);
  const configDirty = useAppStore((s) => s.configDirty);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const parsed = parseConfigText(configText) as Record<string, unknown> | null;
  const domain = parsed?.domain;

  const handleEditConfig = () => {
    setActiveTab('config');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px 6px',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Domains
        </span>
        <button
          onClick={handleEditConfig}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: 'var(--color-accent)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 4px',
            borderRadius: 3,
          }}
        >
          <ExternalLinkIcon size={11} />
          Edit config
        </button>
      </div>

      {/* Preset chip */}
      <div style={{ padding: '0 16px 10px' }}>
        <span
          style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 4,
            background: configDirty ? 'rgba(245,181,68,.15)' : 'var(--bg-elevated)',
            color: configDirty ? '#f5b544' : 'var(--text-secondary)',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: configDirty ? 600 : 400,
          }}
        >
          {configDirty ? `${configPreset} ✎` : configPreset}
        </span>
      </div>

      {/* Domain tree */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {domain ? (
          <DomainNode node={domain} depth={0} />
        ) : (
          <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
            {configText ? 'Could not parse config' : 'No config loaded'}
          </div>
        )}
      </div>
    </div>
  );
}
