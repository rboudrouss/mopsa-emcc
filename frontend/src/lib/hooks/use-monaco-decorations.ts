import type * as Monaco from 'monaco-editor';
import { useEffect, useRef } from 'react';
import type { CheckItem } from '../types';

export function useMonacoDecorations(
  editorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>,
  checks: CheckItem[],
  codeFilePath: string
) {
  const collectionRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const relevant = checks.filter((c) => {
      const f = c.range.start.file;
      return f === codeFilePath || f === codeFilePath.replace(/^\//, '');
    });

    const decorations: Monaco.editor.IModelDeltaDecoration[] = relevant.map((c) => ({
      range: {
        startLineNumber: c.range.start.line,
        startColumn: c.range.start.column,
        endLineNumber: c.range.end.line,
        endColumn: c.range.end.column + 1,
      },
      options: {
        inlineClassName:
          c.kind === 'error' ? 'mopsa-error-span' : 'mopsa-warn-span',
        isWholeLine: false,
        overviewRulerColor: c.kind === 'error' ? '#f87171' : '#f5b544',
        overviewRulerLane: 1,
        minimap: {
          color: c.kind === 'error' ? '#f87171' : '#f5b544',
          position: 1,
        },
      },
    }));

    collectionRef.current?.clear();
    collectionRef.current = editor.createDecorationsCollection(decorations);
  }, [checks, codeFilePath, editorRef]);
}
