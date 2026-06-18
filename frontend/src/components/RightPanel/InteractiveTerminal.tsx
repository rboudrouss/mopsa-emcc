import { useCallback, useEffect, useRef, useState } from "react";
import { AnsiTerminal, type AnsiTerminalHandle } from "@/components/ui/AnsiTerminal";
import { computeAnalysisArgs } from "@/lib/analysis-args";
import { useAppStore } from "@/lib/store";

type Status = "idle" | "running" | "ended" | "error";

/**
 * Live REPL terminal for `-engine=interactive`.
 *
 * Mopsa's stdin is a non-tty char device in WASM, so `tcgetattr` fails and the
 * engine falls back to line-buffered `Stdlib.read_line` with no echo. We
 * therefore do local echo + minimal line editing here and ship the whole line
 * (plus "\n") to stdin on Enter. Engine output (prompt, results) streams back
 * as raw bytes and is written straight to xterm, which renders the ANSI.
 */
export function InteractiveTerminal() {
  const termRef = useRef<AnsiTerminalHandle>(null);
  const sessionRef = useRef<MopsaSessionHandle | null>(null);
  const lineRef = useRef<string>("");
  const [status, setStatus] = useState<Status>("idle");

  const sessionNonce = useAppStore((s) => s.sessionNonce);
  // Seed with the current nonce so a remount (e.g. toggling engines back and
  // forth) doesn't replay the last session from a stale nonce — only fresh
  // Run / auto-start bumps after mount launch a session.
  const lastStartedRef = useRef<number>(sessionNonce);

  const kill = useCallback(() => {
    sessionRef.current?.kill();
    sessionRef.current = null;
  }, []);

  // (Re)start the session whenever the user hits Run (sessionNonce bumps).
  useEffect(() => {
    if (sessionNonce === 0 || sessionNonce === lastStartedRef.current) return;
    lastStartedRef.current = sessionNonce;

    kill();
    lineRef.current = "";
    const term = termRef.current;
    term?.reset();

    const args = computeAnalysisArgs();
    if (!args) {
      term?.write("\x1b[31mNothing to analyse (no entry point).\x1b[0m\r\n");
      setStatus("error");
      return;
    }

    try {
      const session = mopsaJs.startSession("interactive", args);
      sessionRef.current = session;
      setStatus("running");
      session.onData((bytes) => termRef.current?.write(bytes));
      session.onEnd(() => {
        setStatus("ended");
        termRef.current?.write("\r\n\x1b[2m[session ended]\x1b[0m\r\n");
        sessionRef.current = null;
      });
      session.onError((msg) => {
        setStatus("error");
        termRef.current?.write("\r\n\x1b[31m" + msg + "\x1b[0m\r\n");
        sessionRef.current = null;
      });
    } catch (e) {
      setStatus("error");
      term?.write("\x1b[31m" + String((e as Error).message ?? e) + "\x1b[0m\r\n");
    }
  }, [sessionNonce, kill]);

  // Kill the session if the component unmounts (e.g. engine switched away).
  useEffect(() => kill, [kill]);

  // Local line editing: echo printable keys, handle Enter/Backspace/Ctrl-C/D.
  const handleData = useCallback(
    (data: string) => {
      const session = sessionRef.current;
      const term = termRef.current;
      if (!session || !term) return;

      for (const ch of data) {
        const code = ch.charCodeAt(0);
        if (ch === "\r" || ch === "\n") {
          term.write("\r\n");
          session.sendInput(lineRef.current + "\n");
          lineRef.current = "";
        } else if (ch === "\x7f" || ch === "\b") {
          if (lineRef.current.length > 0) {
            lineRef.current = lineRef.current.slice(0, -1);
            term.write("\b \b");
          }
        } else if (ch === "\x03") {
          // Ctrl-C → terminate the run.
          term.write("^C\r\n");
          kill();
          setStatus("ended");
        } else if (ch === "\x04") {
          // Ctrl-D → end of input.
          session.sendEof();
        } else if (code >= 0x20) {
          lineRef.current += ch;
          term.write(ch);
        }
        // Other control sequences (arrows, etc.) are ignored in line mode.
      }
    },
    [kill],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 6 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 600,
        }}
      >
        Interactive
        <span style={{ textTransform: "none", letterSpacing: 0 }}>
          {status === "running"
            ? "● live"
            : status === "ended"
              ? "○ ended"
              : status === "error"
                ? "✕ error"
                : "press Run to start"}
        </span>
        {status === "running" && (
          <button
            onClick={() => {
              kill();
              setStatus("ended");
            }}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 4,
              cursor: "pointer",
              color: "var(--text-secondary)",
              fontSize: 11,
              padding: "2px 8px",
            }}
          >
            Kill
          </button>
        )}
      </div>
      <AnsiTerminal
        ref={termRef}
        onData={handleData}
        style={{
          flex: 1,
          minHeight: 0,
          padding: "8px 10px",
          background: "var(--bg-elevated)",
          borderRadius: 6,
        }}
      />
    </div>
  );
}
