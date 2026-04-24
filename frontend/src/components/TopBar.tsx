import { MoonIcon, PlayIcon, SunIcon } from 'lucide-react';
import { PulseDot } from '@/components/ui/PulseDot';
import { useAppStore } from '@/lib/store';
import type { SupportedLanguage } from '@/lib/types';

interface TopBarProps {
  isAnalyzing: boolean;
  onRunClick: () => void;
  resolvedTheme: 'light' | 'dark';
  onThemeToggle: () => void;
  presets: shareData | undefined;
}

const LANG_OPTIONS: { value: SupportedLanguage; label: string }[] = [
  { value: 'c', label: 'C' },
  { value: 'python', label: 'Python' },
  { value: 'universal', label: 'Universal' },
];

export function TopBar({ isAnalyzing, onRunClick, resolvedTheme, onThemeToggle, presets }: TopBarProps) {
  const checks = useAppStore((s) => s.checks);
  const selectivity = useAppStore((s) => s.selectivity);
  const analysisTime = useAppStore((s) => s.analysisTime);
  const configDirty = useAppStore((s) => s.configDirty);
  const configPreset = useAppStore((s) => s.configPreset);
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const applyPreset = useAppStore((s) => s.applyPreset);

  const safe = checks.filter((c) => c.kind === 'safe').length;
  const total = checks.length;
  const warnings = checks.filter((c) => c.kind === 'warning' || c.kind === 'error').length;

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val.startsWith('lang:')) {
      const newLang = val.slice(5) as SupportedLanguage;
      const langPresets = presets?.configs[newLang] ?? {};
      const firstConfig = Object.values(langPresets)[0] ?? mopsaJs.configUni;
      setLang(newLang, firstConfig);
    } else {
      const [, presetName] = val.split('|');
      const langPresets = presets?.configs[lang] ?? {};
      const text = langPresets[presetName] ?? '';
      if (text) applyPreset(presetName, text);
    }
  };

  const currentValue = configDirty ? 'custom' : `${lang}|${configPreset}`;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 16px',
        height: 48,
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        gridColumn: '1 / -1',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <MopsaLogo />
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
          }}
        >
          mopsa
        </span>
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

      {/* Preset picker */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <select
          value={currentValue}
          onChange={handlePresetChange}
          style={{
            appearance: 'none',
            background: configDirty ? 'rgba(245,181,68,.1)' : 'var(--bg-elevated)',
            border: `1px solid ${configDirty ? 'rgba(245,181,68,.4)' : 'var(--border)'}`,
            borderRadius: 6,
            color: configDirty ? '#f5b544' : 'var(--text-primary)',
            fontSize: 12,
            padding: '4px 28px 4px 10px',
            cursor: 'pointer',
            fontWeight: configDirty ? 600 : 400,
            minWidth: 160,
          }}
        >
          {configDirty && (
            <option value="custom" disabled>
              {configPreset} ✎ custom
            </option>
          )}
          {LANG_OPTIONS.map(({ value, label }) => (
            <optgroup key={value} label={label}>
              {value !== lang && (
                <option value={`lang:${value}`}>Switch to {label}</option>
              )}
              {Object.keys(presets?.configs[value] ?? {}).map((name) => (
                <option key={name} value={`${value}|${name}`}>
                  {name.replace(/\.json$/, '')}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            color: 'var(--text-muted)',
            fontSize: 10,
          }}
        >
          ▾
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Stats */}
      {total > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 12,
            color: 'var(--text-secondary)',
            flexShrink: 0,
          }}
        >
          <span style={{ color: '#4ade80', fontWeight: 500 }}>
            ✓ {safe}/{total}
          </span>
          {warnings > 0 && (
            <span style={{ color: '#f5b544', fontWeight: 500 }}>
              ⚠ {warnings}
            </span>
          )}
          {analysisTime !== null && (
            <span style={{ color: 'var(--text-muted)' }}>⏱ {analysisTime.toFixed(2)}s</span>
          )}
          {selectivity && (
            <span style={{ color: 'var(--text-muted)' }}>{selectivity}</span>
          )}
        </div>
      )}

      <PulseDot active={isAnalyzing} label="Analyzing…" />

      {/* Run button */}
      <button
        onClick={onRunClick}
        disabled={isAnalyzing}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 14px',
          background: isAnalyzing ? 'var(--bg-elevated)' : '#f5b544',
          color: isAnalyzing ? 'var(--text-muted)' : '#0f1117',
          border: 'none',
          borderRadius: 6,
          cursor: isAnalyzing ? 'not-allowed' : 'pointer',
          fontSize: 13,
          fontWeight: 600,
          transition: 'background 150ms',
          flexShrink: 0,
        }}
      >
        <PlayIcon size={14} />
        Run
      </button>

      {/* Theme toggle */}
      <button
        onClick={onThemeToggle}
        title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          background: 'none',
          border: '1px solid var(--border)',
          borderRadius: 6,
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          flexShrink: 0,
          transition: 'color 120ms',
        }}
      >
        {resolvedTheme === 'dark' ? <SunIcon size={15} /> : <MoonIcon size={15} />}
      </button>
    </div>
  );
}

function MopsaLogo() {
  return <img src="/mopsa.png" alt="Mopsa" width={24} height={24} style={{ objectFit: 'contain' }} />;
}
