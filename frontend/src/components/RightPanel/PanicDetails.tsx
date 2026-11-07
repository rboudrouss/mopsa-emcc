import type { PanicInfo } from "@/lib/types";
import { revealInEditor } from "@/lib/editor-nav";

const MONO = "'JetBrains Mono', monospace";

function loc(start: { file: string; line: number }): string {
  return (start.file.split("/").pop() ?? start.file) + ":" + start.line;
}

/**
 * Where a failed analysis stopped: the location, the control context Mopsa
 * reported (calls and loop iterations, innermost first) and its backtrace.
 */
export function PanicDetails({ panic }: { panic: PanicInfo }) {
  const start = panic.range?.start;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {start && (
        <span style={{ color: "var(--text-secondary)" }}>
          at{" "}
          <button
            onClick={() => revealInEditor(start.file, start.line)}
            title="Go to the location"
            style={linkButton}
          >
            {loc(start)}
          </button>
        </span>
      )}
      {panic.callstack.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontFamily: MONO,
            fontSize: 11,
            color: "var(--text-secondary)",
          }}
        >
          {panic.callstack.map((f, i) => {
            const s = f.range.start;
            return (
              <span key={i}>
                {f.function !== undefined
                  ? `in ${f.function}`
                  : `in loop (${f.loop_info})`}
                {s && (
                  <>
                    {" "}
                    <button
                      onClick={() => revealInEditor(s.file, s.line)}
                      style={linkButton}
                    >
                      {loc(s)}
                    </button>
                  </>
                )}
              </span>
            );
          })}
        </div>
      )}
      {panic.backtrace && (
        <details style={{ color: "var(--text-muted)" }}>
          <summary style={{ cursor: "pointer", fontSize: 11 }}>
            Analyzer backtrace
          </summary>
          <pre
            style={{
              margin: "4px 0 0",
              fontFamily: MONO,
              fontSize: 11,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {panic.backtrace}
          </pre>
        </details>
      )}
    </div>
  );
}

const linkButton: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontFamily: MONO,
  fontSize: 11,
  color: "#f87171",
  textDecoration: "underline dotted",
};
