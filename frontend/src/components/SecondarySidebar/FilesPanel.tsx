import { listFiles } from '@/lib/mopsa-client';
import { useAppStore } from '@/lib/store';
import type { SupportedLanguage } from '@/lib/types';

const LANG_CHIP_COLORS: Record<SupportedLanguage, { bg: string; color: string; label: string }> = {
  c:         { bg: 'rgba(96,165,250,.15)',  color: '#60a5fa', label: 'C' },
  python:    { bg: 'rgba(251,191,36,.15)',  color: '#fbbf24', label: 'PY' },
  universal: { bg: 'rgba(167,139,250,.15)', color: '#a78bfa', label: 'UNI' },
};

function getFileLang(filename: string): SupportedLanguage {
  if (filename.endsWith('.py')) return 'python';
  if (filename.endsWith('.uni')) return 'universal';
  return 'c';
}

export function FilesPanel() {
  const checks = useAppStore((s) => s.checks);
  const files = listFiles();

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          padding: '10px 16px 6px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        Files
      </div>
      {files.length === 0 ? (
        <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
          No files
        </div>
      ) : (
        files.map((filename) => {
          const lang = getFileLang(filename);
          const chip = LANG_CHIP_COLORS[lang];
          const fileChecks = checks.filter(
            (c) => c.range.start.file.endsWith(filename) || c.range.start.file.endsWith('/' + filename)
          );
          const warnings = fileChecks.filter((c) => c.kind === 'warning' || c.kind === 'error').length;

          return (
            <div
              key={filename}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 16px',
                cursor: 'default',
                transition: 'background 120ms',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = 'transparent';
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: 3,
                  background: chip.bg,
                  color: chip.color,
                  flexShrink: 0,
                  letterSpacing: '0.03em',
                }}
              >
                {chip.label}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {filename}
              </span>
              {warnings > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#f5b544',
                    flexShrink: 0,
                  }}
                >
                  ⚠{warnings}
                </span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
