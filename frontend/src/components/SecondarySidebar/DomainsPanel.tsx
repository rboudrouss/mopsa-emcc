import { ExternalLinkIcon } from 'lucide-react';
import { DomainNode } from '@/components/ui/DomainNode';
import { parseConfigText } from '@/lib/mopsa-client';
import { usePresets } from '@/lib/hooks/use-presets';
import { getNodePath } from '@/lib/tree';
import { useAppStore } from '@/lib/store';
import type { SupportedLanguage } from '@/lib/types';

const SUPPORTED_EXTENSIONS: Record<string, SupportedLanguage> = {
  c: 'c', h: 'c', py: 'python', u: 'universal',
};

const LANG_DOMAIN_LABEL: Record<SupportedLanguage, string> = {
  c: 'C Domains',
  python: 'Python Domains',
  universal: 'Universal Domains',
};

function isMultilanguage(name: string) {
  return name.toLowerCase().includes('multilanguage') || name.toLowerCase().includes('multilangage');
}

export function DomainsPanel() {
  const configText = useAppStore((s) => s.configText);
  const configPreset = useAppStore((s) => s.configPreset);
  const configDirty = useAppStore((s) => s.configDirty);
  const lang = useAppStore((s) => s.lang);
  const crossLanguage = useAppStore((s) => s.crossLanguage);
  const customConfigs = useAppStore((s) => s.customConfigs);
  const applyPreset = useAppStore((s) => s.applyPreset);
  const applyCustom = useAppStore((s) => s.applyCustom);
  const setLang = useAppStore((s) => s.setLang);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const fileTree = useAppStore((s) => s.fileTree);
  const activeFile = useAppStore((s) => s.activeFile);

  const configKey = crossLanguage ? 'multilanguage' : lang;
  const hasCustom = !!customConfigs[configKey];

  const { data: presets } = usePresets();

  // Derive the extension of the active file to detect unsupported types
  const activeFilePath = activeFile ? getNodePath(fileTree, activeFile) : null;
  const activeExt = activeFilePath ? (activeFilePath.split('.').pop() ?? '') : '';
  const activeLang: SupportedLanguage | null = SUPPORTED_EXTENSIONS[activeExt] ?? null;

  const parsed = parseConfigText(configText) as Record<string, unknown> | null;
  const domain = parsed?.domain;

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (!val) return;
    if (val === 'custom') {
      applyCustom(configKey);
      return;
    }
    const [presetLang, presetName] = val.split('|') as [SupportedLanguage, string];
    const langConfigs = presets?.configs[presetLang as 'c' | 'python' | 'universal' | 'cfg'] ?? {};
    const text = (langConfigs as Record<string, string>)[presetName] ?? '';
    if (!text) return;
    if (presetLang !== lang && !crossLanguage) {
      setLang(presetLang, text);
    } else {
      applyPreset(presetName, text);
    }
  };

  // Build the option list based on crossLanguage mode and active file language
  const renderOptions = () => {
    if (!presets) return null;

    if (crossLanguage) {
      // Only show multilanguage configs (from python section)
      const xlConfigs = Object.entries(presets.configs.python).filter(([name]) => isMultilanguage(name));
      return (
        <optgroup label="Multilanguage">
          {xlConfigs.map(([name]) => (
            <option key={name} value={`python|${name}`}>
              {name.replace(/\.json$/, '')}
            </option>
          ))}
        </optgroup>
      );
    }

    // Normal mode: only show configs for the current file's language
    const targetLang = activeLang ?? lang;
    const configs = presets.configs[targetLang as 'c' | 'python' | 'universal'];
    if (!configs) return null;
    const entries = Object.keys(configs).filter((name) => !isMultilanguage(name));
    return entries.map((name) => (
      <option key={name} value={`${targetLang}|${name}`}>
        {name.replace(/\.json$/, '')}
      </option>
    ));
  };

  const currentLang = crossLanguage ? 'python' : lang;
  const currentValue = configDirty ? 'custom' : `${currentLang}|${configPreset}`;

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
          {crossLanguage
            ? 'Multilanguage Domains'
            : activeLang
              ? LANG_DOMAIN_LABEL[activeLang]
              : 'Domains'}
        </span>
        <button
          onClick={() => setActiveTab('config')}
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

      {/* Config preset picker */}
      <div style={{ padding: '0 16px 10px', position: 'relative' }}>
        {!crossLanguage && activeLang === null ? (
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              fontStyle: 'italic',
              padding: '4px 2px',
              lineHeight: 1.4,
            }}
          >
            Select a file with a supported extension (.c, .h, .py, .u) to configure domains.
          </div>
        ) : (
          <>
            <select
              value={currentValue}
              onChange={handlePresetChange}
              style={{
                appearance: 'none',
                width: '100%',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontSize: 12,
                padding: '4px 28px 4px 10px',
                cursor: 'pointer',
              }}
            >
              {/* "custom" option: selected when editing, selectable when a saved custom exists */}
              {(configDirty || hasCustom) && (
                <option value="custom" disabled={configDirty}>
                  {configDirty ? 'custom *' : '↩ custom'}
                </option>
              )}
              {renderOptions()}
            </select>
            <span
              style={{
                position: 'absolute',
                right: 24,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: 'var(--text-muted)',
                fontSize: 10,
              }}
            >
              ▾
            </span>
          </>
        )}
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
