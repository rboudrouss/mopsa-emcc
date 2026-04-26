import MonacoEditor, { type BeforeMount } from '@monaco-editor/react';
import type * as MonacoNS from 'monaco-editor';
import { useEffect, useState } from 'react';
import { parseConfigText } from '@/lib/mopsa-client';
import { useAppStore } from '@/lib/store';

function defineThemes(monaco: typeof MonacoNS) {
  monaco.editor.defineTheme('mopsa-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#0f1117',
      'editor.foreground': '#e8eaf0',
      'editorLineNumber.foreground': '#4a5470',
      'editorGutter.background': '#0f1117',
    },
  });
  monaco.editor.defineTheme('mopsa-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#1a1e2e',
      'editorGutter.background': '#ffffff',
    },
  });
}

interface ConfigEditorProps {
  resolvedTheme: 'light' | 'dark';
}

export function ConfigEditor({ resolvedTheme }: ConfigEditorProps) {
  const configText = useAppStore((s) => s.configText);
  const configDirty = useAppStore((s) => s.configDirty);
  const lang = useAppStore((s) => s.lang);
  const crossLanguage = useAppStore((s) => s.crossLanguage);
  const customConfigs = useAppStore((s) => s.customConfigs);
  const setConfigText = useAppStore((s) => s.setConfigText);
  const applyCustom = useAppStore((s) => s.applyCustom);

  const configKey = crossLanguage ? 'multilanguage' : lang;
  const hasCustom = !!customConfigs[configKey];
  const isValidJson = parseConfigText(configText) !== null;

  // user explicitly chose to overwrite the existing custom
  const [userAccepted, setUserAccepted] = useState(false);

  // Reset acceptance when leaving custom
  useEffect(() => {
    if (!configDirty) setUserAccepted(false);
  }, [configDirty, configKey]);

  // Editor is blocked when NOT on custom AND a saved custom exists AND user hasn't accepted
  const isBlocked = !configDirty && hasCustom && !userAccepted;

  const handleBeforeMount: BeforeMount = (monaco) => {
    defineThemes(monaco);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar — only visible when JSON is invalid */}
      {!isValidJson && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px 12px',
            background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: '#f87171',
              background: 'rgba(248,113,113,.12)',
              padding: '2px 8px',
              borderRadius: 4,
              fontWeight: 500,
            }}
          >
            Invalid JSON
          </span>
        </div>
      )}

      {isBlocked && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            background: 'rgba(251,191,36,.08)',
            borderBottom: '1px solid rgba(251,191,36,.3)',
            flexShrink: 0,
          }}
        >
          <span style={{ flex: 1, fontSize: 11, color: '#fbbf24' }}>
            ⚠ Un config custom existe pour ce mode, éditer va l'écraser.
          </span>
          <button
            onClick={() => applyCustom(configKey)}
            style={{
              fontSize: 11,
              color: '#fbbf24',
              background: 'rgba(251,191,36,.15)',
              border: '1px solid rgba(251,191,36,.4)',
              borderRadius: 4,
              padding: '2px 8px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Restaurer le custom
          </button>
          <button
            onClick={() => setUserAccepted(true)}
            style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '2px 8px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Écraser
          </button>
        </div>
      )}

      {/* Editor */}
      <div style={{ flex: 1 }}>
        <MonacoEditor
          height="100%"
          language="json"
          value={configText}
          theme={resolvedTheme === 'dark' ? 'mopsa-dark' : 'mopsa-light'}
          beforeMount={handleBeforeMount}
          onChange={(v) => setConfigText(v ?? '', true)}
          options={{
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            lineHeight: 20,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            padding: { top: 12, bottom: 12 },
            tabSize: 2,
            wordWrap: 'off',
            folding: true,
            readOnly: isBlocked,
          }}
        />
      </div>
    </div>
  );
}
