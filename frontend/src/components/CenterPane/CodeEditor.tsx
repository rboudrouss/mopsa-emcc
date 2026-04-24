import MonacoEditor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import type * as MonacoNS from 'monaco-editor';
import { useRef } from 'react';
import { useMonacoDecorations } from '@/lib/hooks/use-monaco-decorations';
import { getCodeFilePath } from '@/lib/mopsa-client';
import { useAppStore } from '@/lib/store';
import type { SupportedLanguage } from '@/lib/types';

const MONACO_LANG: Record<SupportedLanguage, string> = {
  c: 'c',
  python: 'python',
  universal: 'c',
};

function defineThemes(monaco: typeof MonacoNS) {
  monaco.editor.defineTheme('mopsa-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#0f1117',
      'editor.foreground': '#e8eaf0',
      'editorLineNumber.foreground': '#4a5470',
      'editorLineNumber.activeForeground': '#8891a8',
      'editor.lineHighlightBackground': '#161923',
      'editor.selectionBackground': '#252d42',
      'editorWidget.background': '#1e2433',
      'editorSuggestWidget.background': '#1e2433',
      'editorSuggestWidget.border': '#2a3247',
      'editorGutter.background': '#0f1117',
      'scrollbarSlider.background': '#2a3247',
      'scrollbarSlider.hoverBackground': '#4a5470',
    },
  });

  monaco.editor.defineTheme('mopsa-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#1a1e2e',
      'editorLineNumber.foreground': '#8891a8',
      'editorLineNumber.activeForeground': '#4a5470',
      'editor.lineHighlightBackground': '#f8f9fc',
      'editor.selectionBackground': '#e8eaf0',
      'editorWidget.background': '#f0f2f7',
      'editorGutter.background': '#ffffff',
      'scrollbarSlider.background': '#d0d4e0',
    },
  });
}

interface CodeEditorProps {
  resolvedTheme: 'light' | 'dark';
}

export function CodeEditor({ resolvedTheme }: CodeEditorProps) {
  const code = useAppStore((s) => s.code);
  const lang = useAppStore((s) => s.lang);
  const checks = useAppStore((s) => s.checks);
  const setCode = useAppStore((s) => s.setCode);

  const editorRef = useRef<MonacoNS.editor.IStandaloneCodeEditor | null>(null);
  const codeFilePath = getCodeFilePath();

  useMonacoDecorations(editorRef, checks, codeFilePath);

  const handleBeforeMount: BeforeMount = (monaco) => {
    defineThemes(monaco);
  };

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  return (
    <MonacoEditor
      height="100%"
      language={MONACO_LANG[lang]}
      value={code}
      theme={resolvedTheme === 'dark' ? 'mopsa-dark' : 'mopsa-light'}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      onChange={(v) => setCode(v ?? '')}
      options={{
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontLigatures: true,
        lineHeight: 21,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorSmoothCaretAnimation: 'on',
        padding: { top: 12, bottom: 12 },
        overviewRulerBorder: false,
        renderLineHighlight: 'gutter',
        bracketPairColorization: { enabled: true },
        tabSize: 2,
        wordWrap: 'off',
        glyphMargin: false,
        folding: true,
      }}
    />
  );
}
