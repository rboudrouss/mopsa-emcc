import MonacoEditor, { type BeforeMount } from '@monaco-editor/react';
import type * as MonacoNS from 'monaco-editor';
import { parseConfigText } from '@/lib/mopsa-client';
import { useAppStore } from '@/lib/store';
import { useAnalysis } from '@/lib/hooks/use-analysis';

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
  const configPreset = useAppStore((s) => s.configPreset);
  const configDirty = useAppStore((s) => s.configDirty);
  const setConfigText = useAppStore((s) => s.setConfigText);
  const applyPreset = useAppStore((s) => s.applyPreset);
  const { run: runAnalysis } = useAnalysis();

  const isValidJson = parseConfigText(configText) !== null;

  const handleBeforeMount: BeforeMount = (monaco) => {
    defineThemes(monaco);
  };

  const handleApply = () => {
    applyPreset(configPreset, configText);
    runAnalysis();
  };

  const handleRevert = () => {
    setConfigText(configText, false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {!isValidJson && (
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
        )}
        {isValidJson && configDirty && (
          <span
            style={{
              fontSize: 11,
              color: '#4ade80',
              background: 'rgba(74,222,128,.12)',
              padding: '2px 8px',
              borderRadius: 4,
            }}
          >
            Modified
          </span>
        )}
        <div style={{ flex: 1 }} />
        {configDirty && (
          <button
            onClick={handleRevert}
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '3px 10px',
              cursor: 'pointer',
            }}
          >
            Revert
          </button>
        )}
        <button
          onClick={handleApply}
          disabled={!isValidJson}
          style={{
            fontSize: 12,
            color: isValidJson ? '#0f1117' : 'var(--text-muted)',
            background: isValidJson ? '#f5b544' : 'var(--bg-elevated)',
            border: 'none',
            borderRadius: 4,
            padding: '3px 12px',
            cursor: isValidJson ? 'pointer' : 'not-allowed',
            fontWeight: 600,
            transition: 'opacity 120ms',
          }}
        >
          Apply &amp; Re-run
        </button>
      </div>

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
          }}
        />
      </div>
    </div>
  );
}
