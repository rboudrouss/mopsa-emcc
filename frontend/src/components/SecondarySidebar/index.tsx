import { useAppStore } from '@/lib/store';
import { DomainsPanel } from './DomainsPanel';
import { FilesPanel } from './FilesPanel';
import { OptionsPanel } from './OptionsPanel';

export function SecondarySidebar() {
  const activePanel = useAppStore((s) => s.activePanel);

  return (
    <div
      className="sidebar-slide"
      style={{
        width: activePanel ? 280 : 0,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        overflowY: activePanel ? 'auto' : 'hidden',
      }}
    >
      {/* Inner wrapper fixed at 280px so content doesn't reflow during animation */}
      <div style={{ width: 280, overflowY: 'auto', height: '100%' }}>
        {activePanel === 'files' && <FilesPanel />}
        {activePanel === 'domains' && <DomainsPanel />}
        {activePanel === 'options' && <OptionsPanel />}
      </div>
    </div>
  );
}
