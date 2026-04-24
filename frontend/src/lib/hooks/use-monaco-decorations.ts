import type * as Monaco from 'monaco-editor';
import { useEffect, useRef } from 'react';
import type { CheckItem } from '../types';

function inFile(file: string, codeFilePath: string): boolean {
  return file === codeFilePath || file === codeFilePath.replace(/^\//, '');
}

function toRange(r: CheckItem['range']): Monaco.IRange {
  return {
    startLineNumber: r.start.line,
    startColumn: r.start.column,
    endLineNumber: r.end.line,
    endColumn: r.end.column + 1,
  };
}

export function useMonacoDecorations(
  editorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>,
  checks: CheckItem[],
  codeFilePath: string
) {
  const collectionRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const alarms = checks.filter(
      (c) => (c.kind === 'warning' || c.kind === 'error') && inFile(c.range.start.file, codeFilePath)
    );

    const decorations: Monaco.editor.IModelDeltaDecoration[] = [];

    for (const c of alarms) {
      const isError = c.kind === 'error';
      const label = isError ? '🔴' : '⚠️';
      const hoverLines = [`**${label} ${c.title}**`];
      if (c.messages) hoverLines.push('', c.messages);
      if (c.callstack.length > 0) {
        hoverLines.push('', '**Call stack:**');
        for (const frame of c.callstack) {
          hoverLines.push(`- \`${frame.function}\` — ${frame.range.start.file}:${frame.range.start.line}`);
        }
      }

      // Primary alarm location
      decorations.push({
        range: toRange(c.range),
        options: {
          inlineClassName: isError ? 'mopsa-error-span' : 'mopsa-warn-span',
          isWholeLine: false,
          hoverMessage: { value: hoverLines.join('\n'), isTrusted: false },
          overviewRulerColor: isError ? '#f87171' : '#f5b544',
          overviewRulerLane: 1,
          minimap: { color: isError ? '#f87171' : '#f5b544', position: 1 },
        },
      });

      // Call-site frames in this file
      for (const frame of c.callstack) {
        if (!inFile(frame.range.start.file, codeFilePath)) continue;
        decorations.push({
          range: toRange(frame.range),
          options: {
            inlineClassName: 'mopsa-callsite-span',
            isWholeLine: false,
            hoverMessage: {
              value: `**↳ \`${frame.function}\`** — call site\n\nLeads to: **${c.title}**${c.messages ? '\n\n' + c.messages : ''}`,
              isTrusted: false,
            },
          },
        });
      }
    }

    collectionRef.current?.clear();
    collectionRef.current = editor.createDecorationsCollection(decorations);
  }, [checks, codeFilePath, editorRef]);
}
